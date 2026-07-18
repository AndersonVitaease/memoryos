export default function RuntimeHeader({ sprint, title, subtitle }) {
  return (
    <div>
      <div className="text-xs text-violet-400 tracking-widest mb-1">{sprint}</div>
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="text-zinc-400 text-sm mt-1">{subtitle}</p>
    </div>
  );
}