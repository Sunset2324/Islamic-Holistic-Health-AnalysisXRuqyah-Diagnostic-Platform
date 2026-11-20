/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      /*
       * Palet pasien "cerah ramah": warna lembut yang mengajak jujur tanpa menghakimi.
       * mint = tenang & aman (aksi utama), lavender = kepercayaan & ruang aman, peach = hangat (pengganti kuning/merah
       * peringatan agar tidak menakutkan), cream = latar hangat. Angka 700+ dipakai untuk teks (kontras >= 4.5:1).
       */
      colors: {
        cream: '#fffaf3',
        mint: {
          50: '#f0fbf6', 100: '#dcf6ea', 200: '#b9ecd5', 300: '#88dbb9', 400: '#55c49c', 500: '#30a882',
          600: '#22886a', 700: '#1d6d56', 800: '#1a5746', 900: '#17483b', 950: '#0b2a22',
        },
        peach: {
          50: '#fff6f0', 100: '#ffeadc', 200: '#ffd4ba', 300: '#ffb68f', 400: '#fb9163', 500: '#f07443',
          600: '#d85a2b', 700: '#b24522', 800: '#8e3920', 900: '#73311e', 950: '#3e170c',
        },
        lavender: {
          50: '#f7f5fe', 100: '#efebfd', 200: '#e0d9fb', 300: '#c8bbf7', 400: '#aa95f0', 500: '#8d70e5',
          600: '#7754d6', 700: '#6443b9', 800: '#533996', 900: '#46327a', 950: '#2a1c4f',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s ease-out both',
      },
    },
  },
  plugins: [],
};
