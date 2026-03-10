'use client';

import { useAuth } from '@/hooks/use-auth';
import { useEffect, useState } from 'react';
import WhisperTranscriber from '@/components/WhisperTranscriber';

export default function TranscriptionPage() {
  const { user, isLoading } = useAuth();
  const [workspaceId, setWorkspaceId] = useState<string>('');

  useEffect(() => {
    // Get workspace ID from localStorage
    if (typeof window !== 'undefined') {
      const storedWorkspaceId = localStorage.getItem('currentWorkspaceId');
      if (storedWorkspaceId) {
        setWorkspaceId(storedWorkspaceId);
      }
    }
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // useAuth will redirect to login
  }

  const handleSave = (transcriptId: string) => {
    console.log('Transcript saved with ID:', transcriptId);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-purple-50 to-blue-50">
      <WhisperTranscriber
        workspaceId={workspaceId || 'default'}
        onSave={handleSave}
      />
    </div>
  );
}
