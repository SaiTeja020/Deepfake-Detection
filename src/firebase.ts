import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDX845Rxb0vJNkSEuJkw1xgFp9DRahE_wQ",
  authDomain: "foresight-2b6ca.firebaseapp.com",
  projectId: "foresight-2b6ca",
  storageBucket: "foresight-2b6ca.firebasestorage.app",
  messagingSenderId: "201575867246",
  appId: "1:201575867246:web:3d75cbd4e60e3b0372577f"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
