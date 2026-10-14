import axios from 'axios';
import { useAuthStore } from '../../app/store/authStore';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1',
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Manejo de errores 401 para auto-logout si el token expira o es inválido
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Si no es un intento de login, cerramos sesión por token expirado
      if (!error.config.url?.includes('/auth/login')) {
        console.warn("Token inválido o expirado. Cerrando sesión...");
        useAuthStore.getState().logout();
        window.location.href = '/';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
