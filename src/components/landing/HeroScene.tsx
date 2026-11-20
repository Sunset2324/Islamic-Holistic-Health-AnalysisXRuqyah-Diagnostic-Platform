/**
 * Ilustrasi pemandangan tenang: fajar pastel, bukit berhutan, masjid kecil di tepi danau, burung pulang.
 * SVG murni (tanpa gambar luar, tanpa style inline) sehingga tajam di semua layar dan patuh CSP.
 */
export default function HeroScene({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 360" className={className} role="img" aria-label="Pemandangan tenang: masjid di tepi danau dikelilingi hutan saat fajar">
      <defs>
        <linearGradient id="hs-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e0d9fb" />
          <stop offset="0.55" stopColor="#ffeadc" />
          <stop offset="1" stopColor="#fff6f0" />
        </linearGradient>
        <radialGradient id="hs-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff3e6" />
          <stop offset="0.6" stopColor="#ffd4ba" />
          <stop offset="1" stopColor="#ffd4ba" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hs-lake" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c8e9df" />
          <stop offset="1" stopColor="#dcf6ea" />
        </linearGradient>
        <linearGradient id="hs-mosque" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fffaf3" />
          <stop offset="1" stopColor="#efe7f9" />
        </linearGradient>
      </defs>

      {/* langit & matahari terbit */}
      <rect width="480" height="360" fill="url(#hs-sky)" />
      <circle cx="300" cy="170" r="90" fill="url(#hs-sun)" />
      <circle cx="300" cy="170" r="30" fill="#fff3e6" />
      {/* bulan sabit tipis yang masih tersisa */}
      <path d="M92 58a20 20 0 1 0 22 30a16 16 0 1 1 -22 -30z" fill="#ffffff" opacity="0.85" />
      {/* awan */}
      <g fill="#ffffff" opacity="0.7">
        <ellipse cx="170" cy="92" rx="42" ry="9" />
        <ellipse cx="196" cy="84" rx="24" ry="8" />
        <ellipse cx="390" cy="70" rx="34" ry="7" />
      </g>
      {/* burung */}
      <g fill="none" stroke="#8d70e5" strokeWidth="2" strokeLinecap="round" opacity="0.55">
        <path d="M214 132q6 -6 12 0q6 -6 12 0" />
        <path d="M244 116q4 -4 8 0q4 -4 8 0" />
        <path d="M196 146q4 -4 8 0q4 -4 8 0" />
      </g>

      {/* bukit jauh */}
      <path d="M0 214C60 180 120 176 190 196S320 176 380 186S460 196 480 190V260H0Z" fill="#b9ecd5" opacity="0.8" />
      <path d="M0 232C70 208 140 214 210 226S350 206 480 222V270H0Z" fill="#88dbb9" opacity="0.75" />

      {/* masjid kecil di tengah */}
      <g transform="translate(240 168)">
        {/* menara */}
        <rect x="-58" y="-6" width="10" height="70" rx="2" fill="url(#hs-mosque)" />
        <path d="M-58 -6h10l-5 -16z" fill="#55c49c" />
        <rect x="48" y="-6" width="10" height="70" rx="2" fill="url(#hs-mosque)" />
        <path d="M48 -6h10l-5 -16z" fill="#55c49c" />
        {/* badan & kubah */}
        <rect x="-40" y="22" width="80" height="42" rx="3" fill="url(#hs-mosque)" />
        <path d="M-26 24C-26 0 -10 -10 0 -16C10 -10 26 0 26 24Z" fill="#30a882" />
        <path d="M0 -16v-10" stroke="#30a882" strokeWidth="2" />
        <path d="M-3 -30a4 4 0 1 0 6 3a3 3 0 1 1 -6 -3z" fill="#fb9163" />
        {/* pintu & jendela */}
        <path d="M-8 64v-16a8 8 0 0 1 16 0v16z" fill="#1d6d56" opacity="0.85" />
        <path d="M-30 46v-8a5 5 0 0 1 10 0v8z M20 46v-8a5 5 0 0 1 10 0v8z" fill="#1d6d56" opacity="0.6" />
      </g>

      {/* hutan pinus kiri & kanan */}
      <g fill="#30a882">
        <path d="M20 250l18 -52l18 52z" />
        <path d="M48 252l22 -66l22 66z" />
        <path d="M86 250l16 -44l16 44z" />
        <path d="M372 250l16 -46l16 46z" />
        <path d="M398 252l22 -68l22 68z" />
        <path d="M436 250l18 -50l18 50z" />
      </g>
      <g fill="#1d6d56" opacity="0.9">
        <path d="M0 262l14 -40l14 40z" />
        <path d="M118 258l12 -34l12 34z" />
        <path d="M352 258l12 -34l12 34z" />
        <path d="M458 262l14 -42l14 42z" />
      </g>

      {/* danau & pantulan */}
      <rect y="250" width="480" height="110" fill="url(#hs-lake)" />
      <g opacity="0.35">
        <rect x="212" y="252" width="56" height="30" fill="#ffffff" />
        <path d="M222 252C222 270 232 278 240 282C248 278 258 270 258 252Z" fill="#30a882" />
        <rect x="182" y="252" width="10" height="44" fill="#ffffff" />
        <rect x="288" y="252" width="10" height="44" fill="#ffffff" />
      </g>
      <g stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" opacity="0.8">
        <path d="M268 292h44" />
        <path d="M150 306h60" />
        <path d="M300 322h70" />
        <path d="M80 286h34" />
      </g>
      <ellipse cx="300" cy="262" rx="60" ry="5" fill="#fff3e6" opacity="0.8" />

      {/* rumput & daun di depan */}
      <path d="M0 360V318C40 306 70 322 110 330S170 344 200 360Z" fill="#55c49c" />
      <path d="M480 360V312C440 300 400 318 370 330S320 348 300 360Z" fill="#55c49c" />
      <path d="M28 330C34 312 52 300 76 300C70 318 54 330 28 330Z" fill="#30a882" />
      <path d="M440 322C436 306 420 294 398 292C402 310 418 322 440 322Z" fill="#30a882" />
    </svg>
  );
}
