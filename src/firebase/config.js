import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyCirzAjzk7eRbJNoe4q8Pu2K5s-SslLbX0",
  authDomain: "userlogin-f2270.firebaseapp.com",
  projectId: "userlogin-f2270",
  storageBucket: "userlogin-f2270.firebasestorage.app",
  messagingSenderId: "607549496021",
  appId: "1:607549496021:web:810f24e074bfb2c787a05c"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);