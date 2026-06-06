/** Animated Springfield-style sky: drifting puffy clouds behind page content. */
export function Clouds({ className = "" }: { className?: string }) {
  const clouds = [
    { top: "8%", size: 120, delay: "0s", duration: "32s", opacity: 0.95 },
    { top: "22%", size: 80, delay: "-6s", duration: "26s", opacity: 0.8 },
    { top: "45%", size: 150, delay: "-14s", duration: "40s", opacity: 0.9 },
    { top: "65%", size: 90, delay: "-3s", duration: "30s", opacity: 0.75 },
    { top: "80%", size: 130, delay: "-20s", duration: "36s", opacity: 0.85 },
  ];

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      {clouds.map((c, i) => (
        <svg
          key={i}
          className="absolute animate-cloud"
          style={{
            top: c.top,
            width: c.size,
            animationDelay: c.delay,
            animationDuration: c.duration,
            opacity: c.opacity,
          }}
          viewBox="0 0 120 60"
          fill="none"
        >
          <path
            d="M30 50C16 50 8 42 8 32c0-9 7-16 16-16 2-9 10-16 20-16 9 0 17 6 20 14 2-1 5-2 8-2 9 0 16 7 16 16 0 11-9 20-22 20H30z"
            fill="white"
            stroke="currentColor"
            strokeWidth="3"
            className="text-foreground"
          />
        </svg>
      ))}
    </div>
  );
}
