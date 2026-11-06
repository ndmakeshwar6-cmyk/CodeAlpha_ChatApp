// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB0M7L8FHP96QnlnU66MN3rGa_lAvgWSss",
  authDomain: "codealpha-chatapp.firebaseapp.com",
  projectId: "codealpha-chatapp",
  storageBucket: "codealpha-chatapp.firebasestorage.app",
  messagingSenderId: "659010749129",
  appId: "1:659010749129:web:a647ae9e576800046ec318"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
export const auth = getAuth(app);
export const db = getFirestore(app);