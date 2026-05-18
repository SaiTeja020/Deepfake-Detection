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
            
            if (currentUser) {
                // Fetch profile with retries
                let retries = 3;
                let success = false;
                while (retries > 0 && !success) {
                    try {
                        const data = await getUserProfile(currentUser.uid);
                        setProfile(data);
                        success = true;
                    } catch (err) {
                        retries--;
                        if (retries > 0) {
                            console.warn(`Profile fetch failed, retrying... (${retries} left)`);
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        } else {
                            console.error("Initial profile fetch failed after retries:", err);
                            setProfile(null);
                        }
                    }
                }
            } else {
                setProfile(null);
            }
            
            // Only stop loading after we've tried to get the profile
            setLoading(false);
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