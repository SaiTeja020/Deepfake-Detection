import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api';

export const syncUser = async (userData: {
    firebase_uid: string;
    email: string | null;
    name?: string | null;
    profile_pic_url?: string | null;
    bio?: string | null;
    save_history?: boolean;
}) => {
    try {
        const response = await axios.post(`${API_BASE_URL}/users/sync`, userData);
        return response.data;
    } catch (error) {
        console.error('Error syncing user:', error);
        throw error;
    }
};

export const saveScanHistory = async (scanData: {
    firebase_uid: string;
    file_name: string;
    original_media_url: string;
    heatmap_url: string;
    result: string;
    confidence: number;
    model_used: string;
    explanation: string;
}) => {
    try {
        const response = await axios.post(`${API_BASE_URL}/scans/save`, scanData);
        return response.data;
    } catch (error) {
        console.error('Error saving scan history:', error);
        throw error;
    }
};
export const uploadProfilePic = async (firebase_uid: string, imageBase64: string) => {
    try {
        const response = await axios.post(`${API_BASE_URL}/upload/profile-pic`, {
            firebase_uid,
            image: imageBase64
        });
        return response.data as { url: string };
    } catch (error) {
        console.error('Error uploading profile pic:', error);
        throw error;
    }
};

export const uploadScanMedia = async (firebase_uid: string, originalImageBase64?: string, heatmapImageBase64?: string) => {
    try {
        const response = await axios.post(`${API_BASE_URL}/upload/scan`, {
            firebase_uid,
            original_image: originalImageBase64,
            heatmap_image: heatmapImageBase64
        });
        return response.data as { original_url?: string; heatmap_url?: string };
    } catch (error) {
        console.error('Error uploading scan media:', error);
        throw error;
    }
};

export const getUserProfile = async (firebase_uid: string) => {
    try {
        const response = await axios.get(`${API_BASE_URL}/users/${firebase_uid}`);
        return response.data;
    } catch (error) {
        console.error('Error fetching user profile:', error);
        throw error;
    }
};
