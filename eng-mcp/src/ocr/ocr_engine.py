#!/usr/bin/env python3
# OCR-01 — deterministic local OCR worker behind engineering.ocr.read.
#
# Contract (spawned by src/ocrRead.ts, never by a caller):
#   stdin : one JSON object {input, format, preprocess, granularity, maxPages}
#           `input` is a file the Node side already validated and copied into a
#           private 0700 temp dir; `format` comes from the Node magic-byte sniff.
#   stdout: one JSON object — {ok:true, ...result} or {ok:false, code, reason}.
#   exit  : 0 on ok, 3 on a structured failure. stderr is never forwarded.
#
# Invariants:
#   - zero LLM, zero network: Pillow + OpenCV + the tesseract/poppler CLIs only;
#   - deterministic: fixed pipeline (PREPROCESS_VERSION), fixed LANGS, fixed
#     OEM/PSM, OMP_THREAD_LIMIT=1, strict-greater tie breaking in every search;
#   - failure payloads carry a fixed code + fixed reason token ONLY — never
#     exception text, never extracted text (the text goes to the caller alone).
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

PREPROCESS_VERSION = "ocr-pre-v3"  # v3: deskew AND rotation are kept only when they do not lower the page mean confidence
LANGS = "por+eng"
TESSERACT_ARGS = ["--oem", "1", "--psm", "3", "-c", "preserve_interword_spaces=1"]
PDF_DPI = 300
PAGE_TIMEOUT_S = 90
OSD_MIN_CONFIDENCE = 8.0  # below this the OSD rotation is a guess — best_of_4 decides by measurement
UPSCALE_BELOW_PX = 1600
NLM_MAX_PIXELS = 3_000_000  # NLM protects fine UI text; above this (300dpi pages, photos) median3 is ~instant
MAX_SIDE_PX = 5000
SKEW_RANGE_DEG = 10.0
SKEW_MIN_APPLY_DEG = 0.3
SKEW_MIN_GAIN = 1.05
CHILD_ENV = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "OMP_THREAD_LIMIT": "1", "LC_ALL": "C.UTF-8"}


class OcrFailure(Exception):
    def __init__(self, code, reason):
        super().__init__(code)
        self.code = code
        self.reason = reason


def emit(payload, status):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    sys.stdout.flush()
    sys.exit(status)


try:
    import numpy as np
    import cv2
    from PIL import Image, ImageOps, ImageSequence
    Image.MAX_IMAGE_PIXELS = 80_000_000
    cv2.setNumThreads(1)
except Exception:  # dependency missing in this environment — structured, never a crash
    emit({"ok": False, "code": "OCR_ENGINE_FAILED", "reason": "engine_dependency_missing"}, 3)


def run(cmd, timeout):
    try:
        return subprocess.run(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                              env=CHILD_ENV, timeout=timeout, check=False)
    except subprocess.TimeoutExpired:
        raise OcrFailure("OCR_TIMEOUT", "engine_step_timeout")
    except OSError:
        raise OcrFailure("OCR_ENGINE_FAILED", "engine_binary_unavailable")


# ---------- decode ----------

def load_pages(path, fmt, max_pages, workdir):
    """Returns (list of PIL RGB images, total page count in the source)."""
    if fmt == "pdf":
        return render_pdf(path, max_pages, workdir)
    try:
        with Image.open(path) as img:
            frames = []
            total = 0
            for frame in ImageSequence.Iterator(img):
                total += 1
                if len(frames) < max_pages:
                    frame.load()
                    frames.append(frame.copy())
            if not frames:
                raise OcrFailure("OCR_ENGINE_FAILED", "decode_failed")
    except OcrFailure:
        raise
    except Image.DecompressionBombError:
        raise OcrFailure("OCR_ENGINE_FAILED", "image_too_large")
    except Exception:
        raise OcrFailure("OCR_ENGINE_FAILED", "decode_failed")
    return frames, total


def render_pdf(path, max_pages, workdir):
    info = run(["pdfinfo", path], 30)
    match = re.search(rb"^Pages:\s+(\d+)", info.stdout or b"", re.M)
    if info.returncode != 0 or not match:
        raise OcrFailure("PDF_RENDER_FAILED", "pdf_unreadable")
    total = int(match.group(1))
    if total < 1:
        raise OcrFailure("PDF_RENDER_FAILED", "pdf_no_pages")
    last = min(total, max_pages)
    prefix = os.path.join(workdir, "page")
    rendered = run(["pdftoppm", "-r", str(PDF_DPI), "-gray", "-png", "-f", "1", "-l", str(last), path, prefix],
                   PAGE_TIMEOUT_S * last)
    files = sorted((f for f in os.listdir(workdir) if f.startswith("page-") and f.endswith(".png")),
                   key=lambda name: int(re.sub(r"\D", "", name) or 0))
    if rendered.returncode != 0 or len(files) != last:
        raise OcrFailure("PDF_RENDER_FAILED", "pdf_render_error")
    pages = []
    for name in files:
        try:
            with Image.open(os.path.join(workdir, name)) as img:
                img.load()
                pages.append(img.copy())
        except Exception:
            raise OcrFailure("PDF_RENDER_FAILED", "pdf_render_error")
    return pages, total


# ---------- preprocessing (ocr-pre-v3, fixed order; rotation fallback + deskew guard in ocr_page) ----------

def to_gray(img):
    rgb = img.convert("RGB")
    return cv2.cvtColor(np.asarray(rgb), cv2.COLOR_RGB2GRAY)


def rotate_bound(gray, angle_deg, border):
    h, w = gray.shape[:2]
    matrix = cv2.getRotationMatrix2D((w / 2.0, h / 2.0), angle_deg, 1.0)
    cos, sin = abs(matrix[0, 0]), abs(matrix[0, 1])
    nw, nh = int(round(h * sin + w * cos)), int(round(h * cos + w * sin))
    matrix[0, 2] += nw / 2.0 - w / 2.0
    matrix[1, 2] += nh / 2.0 - h / 2.0
    return cv2.warpAffine(gray, matrix, (nw, nh), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=border)


def projection_score(binary, angle_deg):
    h, w = binary.shape[:2]
    matrix = cv2.getRotationMatrix2D((w / 2.0, h / 2.0), angle_deg, 1.0)
    rotated = cv2.warpAffine(binary, matrix, (w, h), flags=cv2.INTER_NEAREST, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    profile = rotated.sum(axis=1, dtype=np.float64)
    return float(np.sum(np.diff(profile) ** 2))


def estimate_skew(gray):
    """Projection-profile skew search in [-10, 10] deg; strict-greater ties keep the smaller |angle|."""
    h, w = gray.shape[:2]
    factor = min(1.0, 1200.0 / max(h, w))
    small = cv2.resize(gray, (max(1, int(w * factor)), max(1, int(h * factor))), interpolation=cv2.INTER_AREA) if factor < 1.0 else gray
    _, binary = cv2.threshold(small, 0, 1, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    base = projection_score(binary, 0.0)
    best_angle, best_score = 0.0, base
    coarse = [round(a * 0.5, 1) for a in range(int(-SKEW_RANGE_DEG * 2), int(SKEW_RANGE_DEG * 2) + 1)]
    coarse.sort(key=lambda a: (abs(a), a))
    for angle in coarse:
        score = projection_score(binary, angle)
        if score > best_score:
            best_angle, best_score = angle, score
    fine = [round(best_angle + step * 0.1, 1) for step in range(-5, 6)]
    fine.sort(key=lambda a: (abs(a - best_angle), a))
    for angle in fine:
        score = projection_score(binary, angle)
        if score > best_score:
            best_angle, best_score = angle, score
    if abs(best_angle) < SKEW_MIN_APPLY_DEG or base <= 0 or best_score < base * SKEW_MIN_GAIN:
        return 0.0
    return best_angle


def osd(gray, workdir):
    """Tesseract OSD: (rotation to apply clockwise in {0,90,180,270}, confidence|None, source)."""
    probe = os.path.join(workdir, "osd.png")
    cv2.imwrite(probe, gray)
    result = run(["tesseract", probe, "stdout", "--psm", "0", "-l", "osd"], PAGE_TIMEOUT_S)
    text = (result.stdout or b"").decode("utf-8", "replace")
    rotate = re.search(r"Rotate:\s+(\d+)", text)
    conf = re.search(r"Orientation confidence:\s+([\d.]+)", text)
    if result.returncode != 0 or not rotate or not conf:
        return 0, None, "osd_unavailable"
    return int(rotate.group(1)) % 360, round(float(conf.group(1)), 2), "osd"


def preprocess(gray, workdir):
    steps = []
    if float(gray.mean()) < 127.0:  # dark-mode / light-on-dark UI: normalize polarity
        gray = cv2.bitwise_not(gray)
        steps.append("invert")
    if gray.shape[0] * gray.shape[1] <= NLM_MAX_PIXELS:
        gray = cv2.fastNlMeansDenoising(gray, None, h=7, templateWindowSize=7, searchWindowSize=21)
        steps.append("denoise_nlm")
    else:
        gray = cv2.medianBlur(gray, 3)
        steps.append("denoise_median")
    gray = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
    steps.append("clahe")
    h, w = gray.shape[:2]
    scale = 2.0 if max(h, w) < UPSCALE_BELOW_PX else 1.0
    if max(h, w) * scale > MAX_SIDE_PX:
        scale = MAX_SIDE_PX / float(max(h, w))
    if scale != 1.0:
        gray = cv2.resize(gray, (int(round(w * scale)), int(round(h * scale))),
                          interpolation=cv2.INTER_CUBIC if scale > 1.0 else cv2.INTER_AREA)
        steps.append("upscale" if scale > 1.0 else "downscale")
    rotation, confidence, source = osd(gray, workdir)
    applied_rotation = 0
    if source == "osd" and rotation != 0 and confidence is not None and confidence >= OSD_MIN_CONFIDENCE:
        gray = rotate_bound(gray, -float(rotation), 255)
        applied_rotation = rotation
        steps.append("rotate")
    elif source != "osd" or confidence is None or confidence < OSD_MIN_CONFIDENCE:
        # ocr-pre-v3: a low-confidence (or unavailable) OSD never applies a blind
        # rotation — ocr_page measures the discrete orientations and keeps the best.
        source = "best_of_4"
    skew = estimate_skew(gray)
    orientation = {"rotationApplied": applied_rotation, "osdRotation": rotation, "osdConfidence": confidence, "source": source}
    return gray, scale, orientation, skew, steps


def limit_raw(gray):
    h, w = gray.shape[:2]
    if max(h, w) <= MAX_SIDE_PX:
        return gray, 1.0
    scale = MAX_SIDE_PX / float(max(h, w))
    return cv2.resize(gray, (int(round(w * scale)), int(round(h * scale))), interpolation=cv2.INTER_AREA), scale


# ---------- recognition ----------

def tesseract_tsv(gray, workdir):
    target = os.path.join(workdir, "ocr.png")
    if not cv2.imwrite(target, gray):
        raise OcrFailure("OCR_ENGINE_FAILED", "intermediate_write_failed")
    result = run(["tesseract", target, "stdout", "-l", LANGS, *TESSERACT_ARGS, "tsv"], PAGE_TIMEOUT_S)
    if result.returncode != 0:
        raise OcrFailure("OCR_ENGINE_FAILED", "tesseract_failed")
    return (result.stdout or b"").decode("utf-8", "replace")


def group_key(row, granularity):
    if granularity == "word":
        return (row["block"], row["par"], row["line"], row["word"])
    if granularity == "line":
        return (row["block"], row["par"], row["line"])
    return (row["block"],)


def parse_tsv(tsv, granularity, scale):
    words = []
    lines = tsv.splitlines()
    for raw in lines[1:]:
        cols = raw.split("\t")
        if len(cols) < 12 or cols[0] != "5":
            continue
        text = cols[11].strip()
        try:
            conf = float(cols[10])
        except ValueError:
            continue
        if not text or conf < 0:
            continue
        words.append({"block": int(cols[2]), "par": int(cols[3]), "line": int(cols[4]), "word": int(cols[5]),
                      "left": int(cols[6]), "top": int(cols[7]), "width": int(cols[8]), "height": int(cols[9]),
                      "conf": conf, "text": text})
    # Page text keeps the tesseract reading order: words by space, lines by \n, paragraphs/blocks by blank line.
    page_lines, current, last_line, last_para = [], [], None, None
    for w in words:
        line_id, para_id = (w["block"], w["par"], w["line"]), (w["block"], w["par"])
        if last_line is not None and line_id != last_line:
            page_lines.append(" ".join(current))
            current = []
            if para_id != last_para:
                page_lines.append("")
        current.append(w["text"])
        last_line, last_para = line_id, para_id
    if current:
        page_lines.append(" ".join(current))
    page_text = "\n".join(page_lines)

    groups, order = {}, []
    for w in words:
        key = group_key(w, granularity)
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(w)
    inv = 1.0 / scale
    blocks = []
    for key in order:
        members = groups[key]
        x0 = min(m["left"] for m in members)
        y0 = min(m["top"] for m in members)
        x1 = max(m["left"] + m["width"] for m in members)
        y1 = max(m["top"] + m["height"] for m in members)
        text_parts, prev = [], None
        for m in members:
            ident = (m["par"], m["line"])
            if prev is not None and ident != prev:
                text_parts.append("\n")
            elif prev is not None:
                text_parts.append(" ")
            text_parts.append(m["text"])
            prev = ident
        blocks.append({
            "text": "".join(text_parts),
            "bbox": {"x": int(round(x0 * inv)), "y": int(round(y0 * inv)),
                     "width": int(round((x1 - x0) * inv)), "height": int(round((y1 - y0) * inv))},
            "confidence": round(sum(m["conf"] for m in members) / len(members), 2),
        })
    mean_conf = round(sum(w["conf"] for w in words) / len(words), 2) if words else None
    return page_text, blocks, mean_conf, len(words)


def ocr_page(img, index, do_preprocess, granularity, workdir):
    page_dir = tempfile.mkdtemp(prefix=f"p{index}-", dir=workdir)
    try:
        if do_preprocess:
            try:
                img = ImageOps.exif_transpose(img)
            except Exception:
                pass
        try:
            gray = to_gray(img)
        except Exception:
            raise OcrFailure("OCR_ENGINE_FAILED", "decode_failed")
        if do_preprocess:
            processed, scale, orientation, skew, steps = preprocess(gray, page_dir)
        else:
            processed, scale = limit_raw(gray)
            orientation = {"rotationApplied": 0, "osdRotation": None, "osdConfidence": None, "source": "disabled"}
            skew, steps = 0.0, (["downscale"] if scale != 1.0 else [])
        text, blocks, mean_conf, word_count = parse_tsv(tesseract_tsv(processed, page_dir), granularity, scale)
        if orientation["source"] == "best_of_4":
            # ocr-pre-v3 best_of_4 (the 0° run above is the baseline candidate):
            # measure the 3 remaining discrete orientations and keep the page with
            # the highest mean confidence. Strict-greater keeps 0° on ties; a page
            # with no words at any orientation stays at 0° — never crashes, and the
            # result is never worse than the unrotated baseline by construction.
            best = (text, blocks, mean_conf, word_count)
            for deg in (90, 180, 270):
                candidate = rotate_bound(processed, -float(deg), 255)
                c_text, c_blocks, c_conf, c_count = parse_tsv(tesseract_tsv(candidate, page_dir), granularity, scale)
                if c_conf is not None and (best[2] is None or c_conf > best[2]):
                    processed, best = candidate, (c_text, c_blocks, c_conf, c_count)
                    orientation = {**orientation, "rotationApplied": deg}
            text, blocks, mean_conf, word_count = best
            steps.append("best_of_4" if orientation["rotationApplied"] else "best_of_4_kept_0")
            if orientation["rotationApplied"]:
                skew = estimate_skew(processed)  # skew of the unrotated image is invalid after rotation
        if skew != 0.0:
            # ocr-pre-v2 guard (kept in v3): projection-profile skew over-rotates perspective-distorted photos
            # (page border / scrollbars bias the profile). Keep the deskew only if the page
            # mean confidence does not drop; ties keep the deskew. Deterministic, one extra pass.
            deskewed = rotate_bound(processed, skew, 255)
            d_text, d_blocks, d_conf, d_count = parse_tsv(tesseract_tsv(deskewed, page_dir), granularity, scale)
            if d_conf is not None and (mean_conf is None or d_conf >= mean_conf):
                processed, text, blocks, mean_conf, word_count = deskewed, d_text, d_blocks, d_conf, d_count
                steps.append("deskew")
            else:
                steps.append("deskew_rejected")
                skew = 0.0
        h, w = processed.shape[:2]
        return {
            "page": index + 1,
            "text": text,
            "blocks": blocks,
            "orientation": orientation,
            "skewDeg": skew,
            "meanConfidence": mean_conf,
            "wordCount": word_count,
            "steps": steps,
            "frame": {"width": int(round(w / scale)), "height": int(round(h / scale))},
        }
    finally:
        shutil.rmtree(page_dir, ignore_errors=True)


def main():
    try:
        request = json.loads(sys.stdin.read() or "{}")
        source = request["input"]
        fmt = request["format"]
        do_preprocess = bool(request.get("preprocess", True))
        granularity = request.get("granularity", "block")
        max_pages = int(request.get("maxPages", 10))
        if fmt not in ("png", "jpeg", "webp", "tiff", "pdf") or granularity not in ("block", "line", "word") or not (1 <= max_pages <= 50):
            raise OcrFailure("INPUT_INVALID", "engine_request_invalid")
    except OcrFailure as failure:
        emit({"ok": False, "code": failure.code, "reason": failure.reason}, 3)
    except Exception:
        emit({"ok": False, "code": "INPUT_INVALID", "reason": "engine_request_invalid"}, 3)
    workdir = tempfile.mkdtemp(prefix="ocr-engine-")
    try:
        pages, total = load_pages(source, fmt, max_pages, workdir)
        results = [ocr_page(img, index, do_preprocess, granularity, workdir) for index, img in enumerate(pages)]
        emit({
            "ok": True,
            "engine": {"tesseract": tesseract_version(), "preprocess": PREPROCESS_VERSION if do_preprocess else "raw",
                       "oem": 1, "psm": 3, "pdfDpi": PDF_DPI if fmt == "pdf" else None},
            "lang": LANGS,
            "format": fmt,
            "sourcePageCount": total,
            "truncated": total > len(results),
            "pages": results,
        }, 0)
    except OcrFailure as failure:
        emit({"ok": False, "code": failure.code, "reason": failure.reason}, 3)
    except SystemExit:
        raise
    except Exception:
        emit({"ok": False, "code": "OCR_ENGINE_FAILED", "reason": "engine_internal_error"}, 3)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def tesseract_version():
    result = run(["tesseract", "--version"], 10)
    first = (result.stdout or b"").decode("utf-8", "replace").splitlines()
    return first[0].strip() if first else None


if __name__ == "__main__":
    main()
