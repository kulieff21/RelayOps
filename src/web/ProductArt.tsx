import { useId } from "react";

export function ProductArt({
  id,
  className = "",
  animated = false,
}: {
  id: string;
  className?: string;
  animated?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const g = (name: string) => `url(#${uid}-${name})`;
  const monitor = id === "MON-QHD-27";
  const mini = id === "PC-MINI-16";
  const ssd = id === "SSD-EXT-1T";
  const ram = id === "RAM-DDR5-16";
  const ups = id === "UPS-900";
  return (
    <svg
      className={`product-art ${className} ${animated ? "art-animated" : ""}`}
      viewBox="0 0 760 620"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={`${uid}-metal`}
          x1="180"
          y1="130"
          x2="600"
          y2="530"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#e3e6e7" />
          <stop offset=".25" stopColor="#a6b0b7" />
          <stop offset=".48" stopColor="#f1f3f2" />
          <stop offset=".75" stopColor="#8e9ba5" />
          <stop offset="1" stopColor="#d3dce0" />
        </linearGradient>
        <linearGradient
          id={`${uid}-side`}
          x1="150"
          y1="260"
          x2="600"
          y2="420"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#657780" />
          <stop offset=".4" stopColor="#b8c2c8" />
          <stop offset="1" stopColor="#465660" />
        </linearGradient>
        <linearGradient
          id={`${uid}-dark`}
          x1="190"
          y1="130"
          x2="600"
          y2="500"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#49636a" />
          <stop offset=".45" stopColor="#223d45" />
          <stop offset="1" stopColor="#10262f" />
        </linearGradient>
        <linearGradient
          id={`${uid}-screen`}
          x1="100"
          y1="100"
          x2="670"
          y2="460"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#28484e" />
          <stop offset=".5" stopColor="#192f40" />
          <stop offset="1" stopColor="#6775a7" />
        </linearGradient>
        <linearGradient
          id={`${uid}-wave`}
          x1="200"
          y1="220"
          x2="630"
          y2="410"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#b6dace" />
          <stop offset=".45" stopColor="#91bbbc" />
          <stop offset="1" stopColor="#c3bce5" />
        </linearGradient>
        <radialGradient id={`${uid}-shadow`}>
          <stop stopColor="#142b33" stopOpacity=".3" />
          <stop offset="1" stopColor="#142b33" stopOpacity="0" />
        </radialGradient>
        <pattern
          id={`${uid}-grain`}
          width="5"
          height="5"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="1" cy="1" r=".4" fill="#142b33" opacity=".16" />
        </pattern>
        <clipPath id={`${uid}-display`}>
          <path d="M134 111 636 146 632 420 131 376Z" />
        </clipPath>
      </defs>
      <ellipse
        cx="395"
        cy="562"
        rx="265"
        ry="32"
        fill={g("shadow")}
        className="art-shadow"
      />
      {monitor ? (
        <g className="hardware monitor-hardware">
          <path d="m363 414 69 5 5 116-70-8z" fill={g("side")} />
          <path d="m368 461 66 5 3 68-70-7z" fill={g("metal")} />
          <path d="m366 520 69 8 104 28-213-15-45-16z" fill={g("metal")} />
          <path d="m281 525 45 16 213 15v7l-216-16-42-16z" fill={g("side")} />
          <path
            d="M121 92q0-8 9-7l524 37q12 0 12 12l-4 302q0 10-13 9l-521-44q-13-1-13-13Z"
            fill={g("side")}
          />
          <path
            d="M118 91q0-9 10-8l517 37q11 1 11 12l-4 300q0 11-10 10l-514-44q-13-1-13-12Z"
            fill="#142830"
            stroke="#6c848d"
            strokeWidth="1.5"
          />
          <path d="M134 111 636 146 632 420 131 376Z" fill={g("screen")} />
          <g clipPath={`url(#${uid}-display)`}>
            <g className="display-wave">
              <path
                d="M48 469C127 182 307 133 399 208S469 408 677 224L733 394Q429 587 249 420T48 469"
                fill={g("wave")}
                opacity=".9"
              />
              <path
                d="M63 492C148 207 308 143 400 218S484 441 714 220"
                stroke="#e3e9ee"
                strokeWidth="3"
                opacity=".7"
              />
              <path
                d="M51 480C139 195 308 139 400 209S477 428 703 214"
                stroke="#b4c9d0"
                strokeWidth="9"
                opacity=".35"
              />
              <path
                d="M44 511C141 226 321 161 414 237S490 457 729 241"
                stroke="#92acae"
                strokeWidth="9"
                opacity=".5"
              />
              <path
                d="M1 294Q295 156 467 275T790 284"
                stroke="#f1e9ff"
                strokeWidth="1"
                opacity=".15"
              />
            </g>
          </g>
          <circle cx="392" cy="415" r="2.5" fill="#c7ddda" />
          <path d="m640 154-3 261" stroke="#9cadb6" opacity=".25" />
        </g>
      ) : mini ? (
        <g className="hardware mini-hardware">
          <path
            d="m181 215 266-79q21-6 34 5l144 105q16 12 10 29L563 473q-5 17-26 12l-331-91q-20-5-22-23l-17-130q-2-20 14-26Z"
            fill={g("side")}
          />
          <path
            d="m185 209 259-76q22-6 38 6l134 98q21 16 1 23l-275 83q-23 7-41-7L177 244q-18-16 8-35Z"
            fill={g("metal")}
            stroke="#dce4e7"
            strokeWidth="1.3"
          />
          <path
            d="m174 246 128 93q19 13 41 7l279-85-71 210q-4 12-19 8l-327-91q-16-5-19-22z"
            fill={g("dark")}
          />
          <path
            d="m345 348 274-83-68 205q-4 12-19 8L324 421z"
            fill={g("side")}
          />
          <path d="m181 249 118 86" stroke="#d9e5e7" opacity=".6" />
          <path d="m249 311 42 30-2 12-42-28z" fill="#0c2128" />
          <path
            d="m198 276 24 17 2 14-24-17z"
            fill="#0c2128"
            stroke="#81979e"
          />
          <path
            d="m232 300 24 17 2 14-24-17z"
            fill="#0c2128"
            stroke="#81979e"
          />
          <ellipse
            cx="297"
            cy="371"
            rx="6"
            ry="8"
            transform="rotate(-28 297 371)"
            fill="#b0d9ca"
          />
          {Array.from({ length: 19 }, (_, i) => (
            <path
              key={i}
              d={`m${370 + i * 11} ${368 - i * 3.2} -10 36`}
              stroke="#3a535c"
              strokeWidth="3"
            />
          ))}
          <path
            d="m377 212 40-12 21 16-40 12z"
            stroke="#7e919b"
            strokeWidth="2"
          />
          <path
            d="m181 213 266-78"
            stroke="#eff3f2"
            strokeWidth="2"
            opacity=".7"
          />
        </g>
      ) : ssd ? (
        <g className="hardware drive-hardware">
          <path
            d="m305 138 160-14q28-2 36 25l72 306q8 29-23 32l-168 18q-29 4-35-25l-66-304q-7-34 24-38Z"
            fill={g("side")}
            stroke="#9bb3bd"
          />
          <path
            d="m292 134 160-14q28-2 35 25l73 304q7 29-24 32l-168 18q-29 4-35-25l-66-304q-7-32 25-36Z"
            fill={g("dark")}
          />
          <path
            d="m290 140 163-14q23-2 29 22l70 300q5 24-22 27l-159 17q-27 2-33-22l-64-296q-6-29 16-34Z"
            fill={g("grain")}
          />
          {Array.from({ length: 18 }, (_, i) => (
            <path
              key={i}
              d={`m${290 + i * 9} ${153 - i * 0.9} 65 303`}
              stroke="#647980"
              opacity=".18"
              strokeWidth="2"
            />
          ))}
          <path d="m390 325 31-3 5 23-31 3z" stroke="#a1b6b8" strokeWidth="2" />
          <path
            d="m398 329 16-1 2 7-7 1 8 9"
            stroke="#bed2d0"
            strokeWidth="2"
          />
          <path d="m408 486 41-5 1 7-40 5z" fill="#0d2029" stroke="#8da3ac" />
          <path d="m272 166 3 15" stroke="#c9dfdd" strokeWidth="3" />
        </g>
      ) : ram ? (
        <g className="hardware ram-hardware">
          <path
            d="m150 248 461-94 18 141-465 92z"
            fill="#254b49"
            stroke="#73918a"
            strokeWidth="2"
          />
          <path
            d="m144 220 463-93 21 141-465 92z"
            fill={g("dark")}
            stroke="#849ca2"
          />
          <path d="m153 228 450-91 14 39-451 90z" fill={g("metal")} />
          {Array.from({ length: 8 }, (_, i) => (
            <g key={i}>
              <path
                d={`m${171 + i * 52} ${287 - i * 10.4} 37-8 7 39-37 8z`}
                fill="#172b31"
                stroke="#6d8386"
              />
              <path
                d={`m${170 + i * 52} ${275 - i * 10.4} 35-7`}
                stroke="#97a4ad"
                opacity=".4"
              />
            </g>
          ))}
          {Array.from({ length: 36 }, (_, i) => (
            <path
              key={i}
              d={`m${170 + i * 12} ${365 - i * 2.4} 3 16 7-1-3-17z`}
              fill="#c1ae77"
            />
          ))}
          <path d="m375 328 4 20 9-1-4-21z" fill="#e0e4e8" />
        </g>
      ) : ups ? (
        <g className="hardware ups-hardware">
          <path
            d="m267 153 124-35 150 60v316l-140 48-134-69z"
            fill={g("side")}
          />
          <path d="m265 154 136 53v334l-136-66z" fill={g("dark")} />
          <path d="m401 207 140-31v318l-140 48z" fill="#2d454f" />
          <path d="m284 238 94 39v70l-94-39z" fill="#132b33" stroke="#789093" />
          <path d="m297 263 66 27v27l-66-28z" fill="#83b4b1" />
          <ellipse
            cx="330"
            cy="360"
            rx="9"
            ry="12"
            transform="rotate(-23 330 360)"
            stroke="#c0d3cf"
            strokeWidth="2"
          />
          {Array.from({ length: 9 }, (_, i) => (
            <path
              key={i}
              d={`m285 ${390 + i * 7} 88 36`}
              stroke="#152d34"
              strokeWidth="3"
            />
          ))}
          {Array.from({ length: 13 }, (_, i) => (
            <path
              key={i}
              d={`m424 ${268 + i * 11} 91-20`}
              stroke="#1c3540"
              strokeWidth="4"
            />
          ))}
          <path d="m271 155 126 49 138-29" stroke="#a3b5bb" opacity=".6" />
        </g>
      ) : (
        <g className="hardware switch-hardware">
          <path
            d="m131 290 151-105 369 112-127 138-384-78z"
            fill={g("metal")}
          />
          <path d="m139 356 385 79v47l-385-83z" fill={g("dark")} />
          <path d="m524 435 127-138v47L524 482z" fill={g("side")} />
          <path
            d="m132 291 378 81 142-74"
            stroke="#eef1ef"
            strokeWidth="2"
            opacity=".5"
          />
          {Array.from({ length: 24 }, (_, i) => (
            <g key={i}>
              <path
                d={`m${177 + i * 13} ${373 + i * 2.72} 10 2 0 10-10-2z`}
                fill="#101f27"
                stroke="#8c9a94"
                strokeWidth=".6"
              />
              <circle
                cx={181 + i * 13}
                cy={371 + i * 2.72}
                r="1"
                fill={i % 3 ? "#9fc8bd" : "#677980"}
              />
            </g>
          ))}
          {Array.from({ length: 12 }, (_, i) => (
            <path
              key={i}
              d={`m${342 + i * 10} ${223 + i * 3} -66 47`}
              stroke="#839097"
              strokeWidth="2"
              opacity=".65"
            />
          ))}
        </g>
      )}
    </svg>
  );
}
