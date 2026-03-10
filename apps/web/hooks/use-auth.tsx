import { NEXTAUTH_API_URL } from "@/lib/config";
import { type ReactNode, createContext, useContext, useEffect, useState } from "react";
type User = {
  id: string;
  email: string;
  name?: string;
  image?: string;
  about?: string;
  coverUrl?: string;
};
type AuthContextType = {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  logout: () => void;
  addAuthHeaders: (headers?: HeadersInit) => HeadersInit;
  setUser: (user: User | null) => void;
};
const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  isLoading: true,
  user: null,
  logout: () => { },
  addAuthHeaders: () => ({}),
  setUser: () => { },
});
export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [user, setUser] = useState<User | null>(null);
  // Load user from localStorage on mount (if available)
  useEffect(() => {
    try {
      const savedUser = localStorage.getItem("auth_user");
      if (savedUser) {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
        setIsAuthenticated(true);
        setIsLoading(false);
      }
    } catch (error) {
      console.error("Error loading user from localStorage:", error);
    }
  }, []);
  useEffect(() => {
    if (!user) {
      async function fetchAuthentication() {
        try {
          const redirectUrl = window.location.href;
          const response = await fetch(`${NEXTAUTH_API_URL}/api/auth/isAuthenticated`, {
            credentials: "include",
          });
          const data = await response.json();
          const isUserAuthenticated = data.isAuthenticated;
          setIsAuthenticated(isUserAuthenticated);
          if (isUserAuthenticated && data.user?.user) {
            try {
              const email = data.user.user.email;
              const userResponse = await fetch(`/api/user/get/byemail/${encodeURIComponent(email)}`);

              if (userResponse.ok) {
                const fetchedUser = await userResponse.json();
                const userData: User = {
                  id: fetchedUser.id || fetchedUser._id,
                  email: fetchedUser.email,
                  name: fetchedUser.name,
                  image: fetchedUser.image,
                  about: fetchedUser.about,
                  coverUrl: fetchedUser.coverUrl,
                };
                setUser(userData);
                // Save user to localStorage
                localStorage.setItem("auth_user", JSON.stringify(userData));
              } else {
                // Fallback or handle error
                console.error("Failed to fetch fresh user data");
                const userData: User = {
                  id: data.user.user.id || data.user.user._id,
                  email: data.user.user.email,
                  name: data.user.user.name,
                  image: data.user.user.image,
                  about: data.user.user.about,
                  coverUrl: data.user.user.coverUrl,
                };
                setUser(userData);
                localStorage.setItem("auth_user", JSON.stringify(userData));
              }
            } catch (err) {
              console.error("Error fetching user details:", err);
              const userData: User = {
                id: data.user.user.id || data.user.user._id,
                email: data.user.user.email,
                name: data.user.user.name,
                image: data.user.user.image,
                about: data.user.user.about,
                coverUrl: data.user.user.coverUrl,
              };
              setUser(userData);
              // Save user to localStorage
              localStorage.setItem("auth_user", JSON.stringify(userData));
            }
          }
          if (!isUserAuthenticated) {
            setIsAuthenticated(false);
            window.location.href = `${NEXTAUTH_API_URL}?redirect=${encodeURIComponent(redirectUrl)}`;
          }
        } catch (error) {
          console.error("Authentication error:", error);
          setIsAuthenticated(false);
        } finally {
          setIsLoading(false);
        }
      }
      fetchAuthentication();
    }
  }, [user]);
  const logout = () => {
    // Clear localStorage
    localStorage.removeItem("auth_user");
    setUser(null);
    setIsAuthenticated(false);
    // Redirect to logout
    window.location.href = `${NEXTAUTH_API_URL}/api/auth/signout`;
  };
  // Helper function to add auth headers to fetch requests
  const addAuthHeaders = (headers: HeadersInit = {}) => {
    if (!user) return headers;
    const authHeaders = {
      "x-user-email": user.email,
      ...(user.name && { "x-user-name": user.name }),
      ...(user.image && { "x-user-image": user.image }),
    };
    // Merge with existing headers
    if (headers instanceof Headers) {
      const newHeaders = new Headers(headers);
      Object.entries(authHeaders).forEach(([key, value]) => {
        newHeaders.set(key, value);
      });
      return newHeaders;
    }
    if (Array.isArray(headers)) {
      return [...headers, ...Object.entries(authHeaders)];
    }
    return {
      ...headers,
      ...authHeaders,
    };
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, user, logout, addAuthHeaders, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  return useContext(AuthContext);
}
