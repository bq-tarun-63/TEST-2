'use client';

import { useState, useEffect, useRef } from 'react';
import { useWhisperTranscription } from '@/hooks/useWhisperTranscription';
import { 
  Mic, 
  MicOff, 
  Save, 
  Download, 
  Copy, 
  Trash2, 
  Clock, 
  FileText,
  Wifi,
  WifiOff,
  AlertCircle,
  Activity
} from 'lucide-react';

interface WhisperTranscriberProps {
  workspaceId: string;
  workareaId?: string;
  onSave?: (transcriptId: string) => void;
}

export default function WhisperTranscriber({ workspaceId, workareaId, onSave }: WhisperTranscriberProps) {
  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [duration, setDuration] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const {
    isRecording,
    connectionStatus,
    transcript,
    segments,
    error,
    isSupported,
    startRecording,
    stopRecording,
    resetTranscript,
  } = useWhisperTranscription({
    wsUrl: 'ws://localhost:8000/asr',
    onError: (err) => {
      console.error('Transcription error:', err);
    },
  });

  // Auto-scroll to bottom
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [segments]);

  // Track duration
  useEffect(() => {
    if (isRecording && !startTime) {
      setStartTime(new Date());
    }

    if (isRecording) {
      durationIntervalRef.current = setInterval(() => {
        if (startTime) {
          const elapsed = Math.floor((Date.now() - startTime.getTime()) / 1000);
          setDuration(elapsed);
        }
      }, 1000);
    } else {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    }

    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, [isRecording, startTime]);

  // Audio level visualization
  useEffect(() => {
    if (isRecording && !audioContextRef.current) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        const audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        const microphone = audioContext.createMediaStreamSource(stream);
        
        analyser.smoothingTimeConstant = 0.8;
        analyser.fftSize = 1024;
        
        microphone.connect(analyser);
        
        audioContextRef.current = audioContext;
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        
        const updateLevel = () => {
          if (analyserRef.current && isRecording) {
            analyserRef.current.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
            setAudioLevel(Math.min(100, (average / 255) * 100));
            requestAnimationFrame(updateLevel);
          }
        };
        
        updateLevel();
      }).catch(console.error);
    }

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
        analyserRef.current = null;
      }
    };
  }, [isRecording]);

  // Format duration
  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hrs > 0) {
      return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  // Handle start/stop
  const handleToggleRecording = async () => {
    if (isRecording) {
      stopRecording();
    } else {
      setStartTime(new Date());
      setDuration(0);
      setSaveSuccess(false);
      await startRecording();
    }
  };

  // Save transcript
  const handleSave = async () => {
    if (!transcript.trim()) {
      alert('No transcript to save');
      return;
    }

    if (!title.trim()) {
      alert('Please enter a title for this transcription');
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch('/api/whisper-transcription/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          transcript: transcript.trim(),
          segments: segments.map((s) => ({
            text: s.text,
            timestamp: s.timestamp,
            isFinal: s.isFinal,
            speaker: s.speaker,
          })),
          duration,
          wordCount: transcript.trim().split(/\s+/).length,
          workspaceId,
          workareaId: workareaId || null,
          source: 'whisperlivekit',
          status: 'completed',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save transcription');
      }

      const data = await response.json();
      setSaveSuccess(true);
      onSave?.(data.transcriptId);

      // Reset after 3 seconds
      setTimeout(() => {
        setSaveSuccess(false);
      }, 3000);
    } catch (error: any) {
      console.error('Save error:', error);
      alert('Failed to save transcription: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Copy to clipboard
  const handleCopy = () => {
    navigator.clipboard.writeText(transcript);
    alert('Transcript copied to clipboard!');
  };

  // Download as text
  const handleDownload = () => {
    const blob = new Blob([transcript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'transcription'}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Clear transcript
  const handleClear = () => {
    if (confirm('Are you sure you want to clear the transcript?')) {
      resetTranscript();
      setTitle('');
      setStartTime(null);
      setDuration(0);
      setSaveSuccess(false);
    }
  };

  // Connection status indicator
  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'bg-green-500';
      case 'connecting':
        return 'bg-yellow-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-400';
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'error':
        return 'Connection Error';
      default:
        return 'Disconnected';
    }
  };

  const getStatusIcon = () => {
    switch (connectionStatus) {
      case 'connected':
        return <Wifi size={16} className="text-green-600" />;
      case 'connecting':
        return <Activity size={16} className="text-yellow-600 animate-pulse" />;
      case 'error':
        return <WifiOff size={16} className="text-red-600" />;
      default:
        return <WifiOff size={16} className="text-gray-600" />;
    }
  };

  if (!isSupported) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <AlertCircle className="mx-auto mb-4 text-red-500" size={48} />
          <h3 className="text-lg font-semibold text-red-900 mb-2">
            Browser Not Supported
          </h3>
          <p className="text-red-700">
            Your browser doesn't support the required APIs (MediaRecorder and WebSocket).
            Please use a modern browser like Chrome, Edge, or Safari.
          </p>
        </div>
      </div>
    );
  }

  const wordCount = transcript.trim().split(/\s+/).filter((w) => w).length;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
            🎙️ Real-Time Transcription
          </h1>
          <p className="text-sm text-gray-600 mt-1">Powered by WhisperLiveKit</p>
        </div>

        {/* Connection Status */}
        <div className="flex items-center gap-2 px-4 py-2 bg-white border rounded-lg shadow-sm">
          {getStatusIcon()}
          <span className="text-sm font-medium">{getStatusText()}</span>
          <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
        </div>
      </div>

      {/* Title Input */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Transcription Title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Team Meeting - Jan 13, 2026"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
          disabled={isRecording}
        />
      </div>

      {/* Status Card */}
      <div className="bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 border border-purple-200 rounded-xl p-6 shadow-lg">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div
              className={`w-5 h-5 rounded-full ${
                isRecording ? 'bg-red-500 animate-pulse shadow-lg shadow-red-500/50' : 'bg-gray-400'
              }`}
            />
            <span className="text-xl font-bold">
              {isRecording ? '🔴 Recording in Progress' : '⚪ Ready to Record'}
            </span>
          </div>

          <div className="flex items-center gap-3 text-gray-700">
            <Clock size={20} />
            <span className="font-mono text-xl font-bold">{formatDuration(duration)}</span>
          </div>
        </div>

        {/* Audio Level Visualizer */}
        {isRecording && (
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <Activity size={16} className="text-purple-600" />
              <span className="text-sm font-medium text-gray-700">Audio Level</span>
            </div>
            <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-100"
                style={{ width: `${audioLevel}%` }}
              />
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={handleToggleRecording}
            disabled={connectionStatus === 'connecting'}
            className={`flex-1 min-w-[200px] flex items-center justify-center gap-2 px-6 py-4 rounded-lg font-bold text-lg transition-all shadow-lg ${
              isRecording
                ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-red-500/30'
                : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white shadow-purple-500/30'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isRecording ? (
              <>
                <MicOff size={24} />
                Stop Recording
              </>
            ) : (
              <>
                <Mic size={24} />
                Start Recording
              </>
            )}
          </button>

          {/* Test Audio Playback Button */}
          {isRecording && (
            <button
              onClick={() => {
                // Test playback to verify audio is being captured
                navigator.mediaDevices.getUserMedia({ audio: true }).then(async (micStream) => {
                  // @ts-ignore
                  const systemStream = await navigator.mediaDevices.getDisplayMedia({
                    video: false,
                    audio: true
                  }).catch(() => null);

                  const audioContext = new AudioContext();
                  const destination = audioContext.createMediaStreamDestination();

                  const micSource = audioContext.createMediaStreamSource(micStream);
                  micSource.connect(destination);

                  if (systemStream) {
                    const systemSource = audioContext.createMediaStreamSource(systemStream);
                    systemSource.connect(destination);
                  }

                  const audio = new Audio();
                  audio.srcObject = destination.stream;
                  audio.play();

                  alert('🔊 Playing back captured audio for 5 seconds...\nYou should hear both your mic and system audio!');
                  
                  setTimeout(() => {
                    audio.pause();
                    audioContext.close();
                    micStream.getTracks().forEach(t => t.stop());
                    systemStream?.getTracks().forEach(t => t.stop());
                  }, 5000);
                });
              }}
              className="px-6 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white rounded-lg font-bold flex items-center gap-2 transition-all shadow-lg shadow-blue-500/30"
              title="Test audio playback"
            >
              🔊 Test Audio
            </button>
          )}

          {transcript && (
            <>
              <button
                onClick={handleSave}
                disabled={isSaving || !title.trim()}
                className="px-6 py-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg font-bold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-green-500/30"
              >
                <Save size={20} />
                {isSaving ? 'Saving...' : saveSuccess ? '✓ Saved!' : 'Save'}
              </button>

              <button
                onClick={handleCopy}
                className="px-5 py-4 bg-gray-700 hover:bg-gray-800 text-white rounded-lg transition-all shadow-lg"
                title="Copy to clipboard"
              >
                <Copy size={20} />
              </button>

              <button
                onClick={handleDownload}
                className="px-5 py-4 bg-gray-700 hover:bg-gray-800 text-white rounded-lg transition-all shadow-lg"
                title="Download as text"
              >
                <Download size={20} />
              </button>

              <button
                onClick={handleClear}
                className="px-5 py-4 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all shadow-lg"
                title="Clear transcript"
              >
                <Trash2 size={20} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <strong className="text-red-900 font-semibold">Error:</strong>
            <p className="text-red-800 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Stats */}
      {transcript && (
        <div className="flex gap-6 text-sm text-gray-600 bg-white p-4 rounded-lg border shadow-sm">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-purple-600" />
            <span className="font-semibold">{wordCount} words</span>
          </div>
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-blue-600" />
            <span className="font-semibold">{segments.length} segments</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-green-600" />
            <span className="font-semibold">{formatDuration(duration)}</span>
          </div>
        </div>
      )}

      {/* Transcript Display */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
        <div className="border-b bg-gradient-to-r from-purple-50 to-blue-50 px-6 py-4">
          <h2 className="text-xl font-bold text-gray-800">Live Transcript</h2>
        </div>

        <div className="p-6 max-h-[600px] overflow-y-auto">
          {!transcript && segments.length === 0 && (
            <div className="text-center py-20">
              <Mic className="mx-auto mb-4 text-gray-300" size={64} />
              <p className="text-gray-400 text-lg">
                Click "Start Recording" to begin real-time transcription...
              </p>
            </div>
          )}

          {segments.map((segment, index) => (
            <div
              key={index}
              className="mb-4 pb-4 border-b border-gray-100 last:border-0 hover:bg-purple-50/30 p-3 rounded-lg transition-colors"
            >
              <div className="flex gap-4">
                <span className="text-xs text-gray-400 font-mono min-w-[80px] flex-shrink-0 pt-1">
                  {new Date(segment.timestamp).toLocaleTimeString()}
                </span>
                <div className="flex-1">
                  {segment.speaker && (
                    <span className="text-xs font-semibold text-purple-600 mb-1 block">
                      {segment.speaker}
                    </span>
                  )}
                  <p className="text-gray-800 leading-relaxed">{segment.text}</p>
                  {!segment.isFinal && (
                    <span className="text-xs text-gray-400 italic ml-2">(interim)</span>
                  )}
                </div>
              </div>
            </div>
          ))}

          <div ref={transcriptEndRef} />
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6">
        <h3 className="font-bold text-blue-900 mb-3 flex items-center gap-2">
          <AlertCircle size={20} />
          💡 Tips for Best Results
        </h3>
        <ul className="text-sm text-blue-800 space-y-2">
          <li className="flex items-start gap-2">
            <span className="text-blue-600 font-bold">•</span>
            <span>Ensure WhisperLiveKit is running on <code className="bg-blue-100 px-2 py-0.5 rounded">localhost:8000</code></span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 font-bold">•</span>
            <span>Speak clearly and minimize background noise for better accuracy</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 font-bold">•</span>
            <span>Use a good quality microphone for optimal results</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 font-bold">•</span>
            <span>The transcript updates in real-time as you speak</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 font-bold">•</span>
            <span>Connection will auto-reconnect if temporarily lost</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
