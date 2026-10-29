/**
 * Vercel Serverless Function (/api/firebase-config)
 * Vercel 대시보드의 Environment Variables (NEXT_PUBLIC_FIREBASE_* 또는 FIREBASE_*)를
 * 우선 읽고, 미설정 시 myplayer-3df2c 기본 구성을 반환합니다.
 */
module.exports = (req, res) => {
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
  res.status(200).json({
    apiKey:
      process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
      process.env.VITE_FIREBASE_API_KEY ||
      process.env.FIREBASE_API_KEY ||
      'AIzaSyAou_o0lGR4Sv_Dk8QCe1QeOcCLdCnbkFY',
    authDomain:
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
      process.env.VITE_FIREBASE_AUTH_DOMAIN ||
      process.env.FIREBASE_AUTH_DOMAIN ||
      'myplayer-3df2c.firebaseapp.com',
    databaseURL:
      process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ||
      process.env.VITE_FIREBASE_DATABASE_URL ||
      process.env.FIREBASE_DATABASE_URL ||
      'https://myplayer-3df2c-default-rtdb.firebaseio.com',
    projectId:
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
      process.env.VITE_FIREBASE_PROJECT_ID ||
      process.env.FIREBASE_PROJECT_ID ||
      'myplayer-3df2c',
    storageBucket:
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
      process.env.VITE_FIREBASE_STORAGE_BUCKET ||
      process.env.FIREBASE_STORAGE_BUCKET ||
      'myplayer-3df2c.firebasestorage.app',
    messagingSenderId:
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ||
      process.env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
      process.env.FIREBASE_MESSAGING_SENDER_ID ||
      '891023045874',
    appId:
      process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||
      process.env.VITE_FIREBASE_APP_ID ||
      process.env.FIREBASE_APP_ID ||
      '1:891023045874:web:1c404215652e5950ac4c6b',
    measurementId:
      process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ||
      process.env.VITE_FIREBASE_MEASUREMENT_ID ||
      process.env.FIREBASE_MEASUREMENT_ID ||
      'G-25D28SF5H0'
  });
};
