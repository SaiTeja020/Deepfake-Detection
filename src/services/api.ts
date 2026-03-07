import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api';

export const syncUser = async (userData: {
    firebase_uid: string;
    email: string | null;
    name?: string | null;
    profile_pic_url?: string | null;
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
