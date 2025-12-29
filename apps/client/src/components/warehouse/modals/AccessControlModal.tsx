import React, { useState, useEffect } from "react";
import { X, Shield, User, Mail, Clock, Loader2 } from "lucide-react";

interface UserInfo {
  id: number;
  email: string;
  username: string;
}

interface AccessControlModalProps {
  onClose: () => void;
}

export default function AccessControlModal({ onClose }: AccessControlModalProps) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUserInfo();
  }, []);

  const fetchUserInfo = async () => {
    try {
      const response = await fetch("/api/auth/me", {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setUser(data);
      }
    } catch (err) {
      console.error("Failed to fetch user info:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#004E89]/10">
              <Shield className="w-5 h-5 text-[#004E89]" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Access Control</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-[#004E89]" />
            </div>
          ) : user ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-muted/50 border border-border">
                <h3 className="text-sm font-medium text-muted-foreground mb-3">Current User</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-white border border-border">
                      <User className="w-4 h-4 text-[#004E89]" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Username</p>
                      <p className="font-medium text-foreground">{user.username}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-white border border-border">
                      <Mail className="w-4 h-4 text-[#004E89]" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Email</p>
                      <p className="font-medium text-foreground">{user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-white border border-border">
                      <Shield className="w-4 h-4 text-[#004E89]" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Role</p>
                      <p className="font-medium text-foreground">Administrator</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-amber-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-800">Role Management Coming Soon</p>
                    <p className="text-sm text-amber-700 mt-1">
                      Advanced role-based access control with custom permissions will be available in a future update.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-muted/30 border border-border">
                <h3 className="text-sm font-medium text-foreground mb-2">Current Permissions</h3>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    Full access to all warehouse sites
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    Manage inventory and transfers
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    Import/Export data
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    Configure system settings
                  </li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Unable to load user information.
            </div>
          )}
        </div>

        <div className="flex items-center justify-end p-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg bg-[#004E89] text-white hover:bg-[#003d6d] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
