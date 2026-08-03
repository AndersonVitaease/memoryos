import React from "react";

export default function DateSeparator({ date }) {
  return (
    <div className="flex items-center justify-center my-4 first:mt-0">
      <span className="text-[11px] font-medium text-zinc-400 bg-zinc-100/70 px-3 py-1 rounded-full">
        {date}
      </span>
    </div>
  );
}