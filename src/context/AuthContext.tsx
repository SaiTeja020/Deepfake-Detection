import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "../firebase";
import { getUserProfile } from "../services/api";

interface UserProfile {
    id?: string;
    firebase_uid: string;
    email: string;
    name: string;
    profile_pic_url: string | null;
    save_history: boolean;
    bio?: string;
}

interface AuthContextType {
    user: User | null;
    profile: UserProfile | null;
    loading: boolean;
    refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    profile: null,
    loading: true,
    refreshProfile: async () => { },
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    const refreshProfile = useCallback(async () => {
        if (auth.currentUser) {
            try {
                const data = await getUserProfile(auth.currentUser.uid);
                setProfile(data);
            } catch (err) {
                console.error("Failed to fetch global profile:", err);
            }
        } else {
            setProfile(null);
        }
    }, []);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);
            // Don't block initial app render on backend profile API.
            setLoading(false);
            if (currentUser) {
                // Fetch profile when user logs in
                try {
                    const data = await getUserProfile(currentUser.uid);
                    setProfile(data);
                } catch (err) {
                    console.error("Initial profile fetch failed:", err);
                    setProfile(null);
                }
            } else {
                setProfile(null);
            }
        });

        return () => unsubscribe();
    }, []);

    return (
        <AuthContext.Provider value={{ user, profile, loading, refreshProfile }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);