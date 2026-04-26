"use client";

import { useEffect, useRef, useState } from "react";

type Orientation = "horizontal" | "vertical";

const IMG_SRC = "/6-7-kid.jpeg";
// Tiny tile size — roughly matches the old "6-7" text glyph size.
const TILE_PX = 22;

function Rail({
  orientation,
  className,
}: {
  orientation: Orientation;
  className: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const available =
        orientation === "horizontal" ? el.clientWidth : el.clientHeight;
      if (!available) return;
      setCount(Math.max(1, Math.floor(available / TILE_PX)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [orientation]);

  const tiles = Array.from({ length: count }, (_, i) => (
    <img
      key={i}
      src={IMG_SRC}
      alt=""
      width={TILE_PX}
      height={TILE_PX}
      style={{ width: TILE_PX, height: TILE_PX, display: "block" }}
      draggable={false}
    />
  ));

  return (
    <div ref={ref} className={className}>
      {tiles}
    </div>
  );
}

export function Rails67() {
  return (
    <>
      <Rail orientation="vertical" className="rail-67 left" />
      <Rail orientation="vertical" className="rail-67 right" />
      <Rail orientation="horizontal" className="rail-67-h top" />
      <Rail orientation="horizontal" className="rail-67-h bot" />
    </>
  );
}
