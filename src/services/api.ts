import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api';
const apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: 8000,
});

export const syncUser = async (userData: {
    firebase_uid: string;
    email: string | null;
    name?: string | null;
    profile_pic_url?: string | null;
    bio?: string | null;
    save_history?: boolean;
}) => {
    try {
        const response = await apiClient.post('/users/sync', userData);
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
        const response = await apiClient.post('/scans/save', scanData);
        return response.data;
    } catch (error) {
        console.error('Error saving scan history:', error);
        throw error;
    }
};
export const uploadProfilePic = async (firebase_uid: string, imageBase64: string) => {
    try {
        const response = await apiClient.post('/upload/profile-pic', {
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
        const response = await apiClient.post('/upload/scan', {
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
        const response = await apiClient.get(`/users/${firebase_uid}`);
        return response.data;
    } catch (error) {
        console.error('Error fetching user profile:', error);
        throw error;
    }
};

export const detectDeepfake = async (firebase_uid: string, base64Image: string, modelType: string) => {
    try {
        const response = await apiClient.post('/detect', {
            firebase_uid,
            image: base64Image,
            model_type: modelType
        });
        return response.data;
    } catch (error) {
        console.error('Error in deepfake detection:', error);
        throw error;
    }
};

export const getScanHistory = async (firebase_uid: string) => {
    try {
        const response = await apiClient.get(`/scans/history/${firebase_uid}`);
        return response.data;
    } catch (error) {
        console.error('Error fetching scan history:', error);
        throw error;
    }
};

export const clearScanHistory = async (firebase_uid: string) => {
    try {
        const response = await apiClient.delete(`/scans/history/${firebase_uid}`);
        return response.data;
    } catch (error) {
        console.error('Error clearing scan history:', error);
        throw error;
    }
};
