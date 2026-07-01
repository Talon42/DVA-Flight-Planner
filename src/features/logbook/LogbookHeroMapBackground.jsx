// Renders the decorative brand-tinted world-map layer behind the Pilot Stats hero content.
export default function LogbookHeroMapBackground({ className = "" }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      viewBox="0 0 920 280"
      preserveAspectRatio="xMidYMid slice"
    >
      <g fill="currentColor">
        <path d="M86 78c21-28 73-33 104-21 20 8 41 5 58 18 14 11 17 31 6 45-13 17-43 14-61 24-17 10-28 31-50 28-18-3-17-24-31-31-19-10-52 0-61-22-6-15 23-25 35-41Z" />
        <path d="M231 155c23-12 61-5 78 13 15 16 3 40-14 49-25 13-44-15-70-9-18 4-42 20-53 1-13-23 36-42 59-54Z" />
        <path d="M364 62c24-22 76-18 109-12 43 8 82 12 119 39 23 17 55 19 72 44 10 15 7 36-9 45-22 13-49-8-72 4-26 14-22 50-53 55-37 6-54-34-77-54-23-19-69-17-83-47-10-22-27-54-6-74Z" />
        <path d="M521 192c25-11 66 4 78 27 9 18-9 35-28 37-22 2-30-22-49-28-13-4-34 1-40-13-8-18 21-15 39-23Z" />
        <path d="M664 53c31-24 99-22 135-8 35 14 70 43 66 81-3 29-40 39-66 34-27-6-38-29-64-36-28-8-69 7-84-22-8-16-1-38 13-49Z" />
        <path d="M718 174c24-8 64 0 86 12 29 16 50 49 34 79-15 29-58 26-83 10-18-12-15-37-32-49-18-12-47-4-53-25-5-17 29-21 48-27Z" />
      </g>
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2">
        <path d="M34 93c96-34 181-44 260-31" opacity="0.22" />
        <path d="M321 55c125-29 272-16 373 32" opacity="0.28" />
        <path d="M604 174c80-26 170-24 264 4" opacity="0.2" />
        <path d="M149 217c153 18 278 7 391-26" opacity="0.14" />
      </g>
    </svg>
  );
}
