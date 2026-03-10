import { useState, useRef, useCallback, useEffect } from 'react';

export interface TranscriptMessage {
    type: 'transcript' | 'ready_to_stop' | 'error';
    text?: string;
    timestamp?: number;
    is_final?: boolean;
    speaker?: string;
}

export interface TranscriptSegment {
    text: string;
    timestamp: number;
    isFinal: boolean;
    speaker?: string;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface UseWhisperTranscriptionOptions {
    wsUrl?: string;
    onError?: (error: Error) => void;
    onTranscript?: (segment: TranscriptSegment) => void;
    autoReconnect?: boolean;
    reconnectInterval?: number;
}

export function useWhisperTranscription(options: UseWhisperTranscriptionOptions = {}) {
    const {
        wsUrl = 'ws://localhost:8000/asr',
        onError,
        onTranscript,
        autoReconnect = true,
        reconnectInterval = 3000,
    } = options;

    const [isRecording, setIsRecording] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
    const [transcript, setTranscript] = useState('');
    const [segments, setSegments] = useState<TranscriptSegment[]>([]);
    const [error, setError] = useState<string | null>(null);

    const wsRef = useRef<WebSocket | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const reconnectAttemptsRef = useRef(0);

    // Check browser support
    const isSupported = typeof window !== 'undefined' &&
        'MediaRecorder' in window &&
        'WebSocket' in window;

    // Connect to WebSocket
    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            return;
        }

        setConnectionStatus('connecting');
        setError(null);

        try {
            const ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                console.log('WebSocket connected');
                setConnectionStatus('connected');
                reconnectAttemptsRef.current = 0;
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);

                    // WhisperLiveKit format: { status, lines: [{text, speaker, start, end}], ... }
                    if (data.status === 'active_transcription' && data.lines && Array.isArray(data.lines)) {
                        // Process each line that has text
                        data.lines.forEach((line: any) => {
                            if (line.text && line.text.trim()) {
                                const segment: TranscriptSegment = {
                                    text: line.text,
                                    timestamp: Date.now(),
                                    isFinal: true,
                                    speaker: line.speaker !== -2 ? `Speaker ${line.speaker}` : undefined,
                                };

                                setSegments((prev) => {
                                    // Avoid duplicates
                                    const exists = prev.some(s => s.text === line.text);
                                    if (exists) return prev;
                                    return [...prev, segment];
                                });

                                setTranscript((prev) => {
                                    // Avoid duplicates
                                    if (prev.includes(line.text)) return prev;
                                    return prev + (prev ? ' ' : '') + line.text;
                                });

                                onTranscript?.(segment);
                            }
                        });
                    }
                    // Original format support (fallback)
                    else if (data.type === 'transcript' && data.text) {
                        const segment: TranscriptSegment = {
                            text: data.text,
                            timestamp: data.timestamp || Date.now(),
                            isFinal: data.is_final || false,
                            speaker: data.speaker,
                        };

                        setSegments((prev) => [...prev, segment]);
                        setTranscript((prev) => prev + (prev ? ' ' : '') + data.text);
                        onTranscript?.(segment);
                    } else if (data.type === 'error') {
                        const errorMsg = data.text || 'Unknown error from server';
                        setError(errorMsg);
                        onError?.(new Error(errorMsg));
                    }
                } catch (err) {
                    console.error('Error parsing WebSocket message:', err);
                }
            };

            ws.onerror = (event) => {
                console.error('WebSocket error:', event);
                setConnectionStatus('error');
                setError('WebSocket connection error');
                onError?.(new Error('WebSocket connection error'));
            };

            ws.onclose = () => {
                console.log('WebSocket closed');
                setConnectionStatus('disconnected');

                // Auto-reconnect if recording
                if (autoReconnect && isRecording && reconnectAttemptsRef.current < 5) {
                    reconnectAttemptsRef.current++;
                    reconnectTimeoutRef.current = setTimeout(() => {
                        console.log(`Reconnecting... (attempt ${reconnectAttemptsRef.current})`);
                        connect();
                    }, reconnectInterval);
                }
            };

            wsRef.current = ws;
        } catch (err) {
            console.error('Error creating WebSocket:', err);
            setConnectionStatus('error');
            setError('Failed to create WebSocket connection');
            onError?.(err as Error);
        }
    }, [wsUrl, autoReconnect, reconnectInterval, isRecording, onError, onTranscript]);

    // Start recording
    const startRecording = useCallback(async () => {
        if (!isSupported) {
            const err = 'Browser does not support required APIs';
            setError(err);
            onError?.(new Error(err));
            return;
        }

        try {
            // Request microphone access
            console.log('🎤 Requesting microphone access...');
            const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log('✅ Microphone access granted');

            // Request system/tab audio capture
            console.log('🖥️ Requesting system audio capture...');
            let systemStream: MediaStream | null = null;

            try {
                // Note: Chrome requires video to be requested
                // @ts-ignore - getDisplayMedia is supported in modern browsers
                const displayStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true, // Required by Chrome, but we only use audio
                    audio: {
                        echoCancellation: false,
                        noiseSuppression: false,
                        autoGainControl: false,
                    }
                });

                // Extract only audio tracks
                const audioTracks = displayStream.getAudioTracks();
                if (audioTracks.length > 0) {
                    systemStream = new MediaStream(audioTracks);
                    // Stop video tracks (we don't need them)
                    displayStream.getVideoTracks().forEach(track => track.stop());
                } else {
                    console.warn('⚠️ No audio track in selected tab');
                    displayStream.getTracks().forEach(track => track.stop());
                }
                console.log('✅ System audio access granted');
            } catch (err) {
                console.warn('⚠️ System audio not available, using microphone only:', err);
            }

            // Mix microphone and system audio using Web Audio API
            const audioContext = new AudioContext();
            const destination = audioContext.createMediaStreamDestination();

            // Add microphone
            const micSource = audioContext.createMediaStreamSource(micStream);
            micSource.connect(destination);
            console.log('✅ Microphone connected to mixer:', micStream.getAudioTracks().map(t => ({
                label: t.label,
                enabled: t.enabled,
                muted: t.muted
            })));

            // Add system audio if available
            if (systemStream) {
                const systemSource = audioContext.createMediaStreamSource(systemStream);
                systemSource.connect(destination);
                console.log('✅ System audio connected to mixer:', systemStream.getAudioTracks().map(t => ({
                    label: t.label,
                    enabled: t.enabled,
                    muted: t.muted
                })));
            } else {
                console.warn('⚠️ No system audio - only microphone will be captured');
            }

            // Use the mixed stream
            const mixedStream = destination.stream;
            streamRef.current = mixedStream;

            console.log('🎵 Mixed stream tracks:', mixedStream.getAudioTracks().map(t => ({
                label: t.label,
                enabled: t.enabled,
                readyState: t.readyState
            })));

            // Connect WebSocket
            connect();

            // Wait for WebSocket to be ready
            console.log('⏳ Waiting for WebSocket connection...');
            await new Promise<void>((resolve, reject) => {
                const checkConnection = setInterval(() => {
                    if (wsRef.current?.readyState === WebSocket.OPEN) {
                        clearInterval(checkConnection);
                        console.log('✅ WebSocket ready!');
                        resolve();
                    } else if (wsRef.current?.readyState === WebSocket.CLOSED) {
                        clearInterval(checkConnection);
                        reject(new Error('WebSocket connection failed'));
                    }
                }, 100);

                // Timeout after 5 seconds
                setTimeout(() => {
                    clearInterval(checkConnection);
                    reject(new Error('WebSocket connection timeout'));
                }, 5000);
            });

            // Create MediaRecorder with WebM/Opus format
            const mimeType = 'audio/webm;codecs=opus';
            console.log('🔍 Checking MIME type support:', mimeType, MediaRecorder.isTypeSupported(mimeType));

            if (!MediaRecorder.isTypeSupported(mimeType)) {
                throw new Error(`MIME type ${mimeType} is not supported`);
            }

            const mediaRecorder = new MediaRecorder(mixedStream, {
                mimeType,
            });

            let chunkCount = 0;
            mediaRecorder.ondataavailable = (event) => {
                chunkCount++;
                console.log(`📊 Chunk #${chunkCount}:`, {
                    size: event.data.size,
                    type: event.data.type,
                    wsReady: wsRef.current?.readyState === WebSocket.OPEN
                });

                if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
                    console.log('✅ Sending to WhisperLiveKit:', event.data.size, 'bytes');
                    wsRef.current.send(event.data);
                } else if (event.data.size === 0) {
                    console.warn('⚠️ Empty audio chunk - microphone might not be capturing');
                } else {
                    console.warn('⚠️ WebSocket not ready, skipping chunk');
                }
            };

            mediaRecorder.onerror = (event) => {
                console.error('MediaRecorder error:', event);
                const err = 'Audio recording error';
                setError(err);
                onError?.(new Error(err));
            };

            mediaRecorder.onstart = () => {
                console.log('🎙️ MediaRecorder started!');
            };

            mediaRecorder.onstop = () => {
                console.log('⏹️ MediaRecorder stopped');
                // Clean up audio context
                audioContext.close();
            };

            // Start recording with 100ms chunks
            console.log('🎙️ Starting MediaRecorder with 100ms chunks...');
            mediaRecorder.start(100);
            mediaRecorderRef.current = mediaRecorder;
            setIsRecording(true);
            setError(null);
            console.log('✅ Recording started successfully!');
        } catch (err) {
            console.error('❌ Error starting recording:', err);
            const errorMsg = err instanceof Error ? err.message : 'Failed to start recording';
            setError(errorMsg);
            onError?.(err as Error);

            // Cleanup on error
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((track) => track.stop());
                streamRef.current = null;
            }
        }
    }, [isSupported, connect, onError]);

    // Stop recording
    const stopRecording = useCallback(() => {
        // Stop MediaRecorder
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current = null;
        }

        // Stop all audio tracks
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }

        // Close WebSocket
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }

        // Clear reconnect timeout
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }

        setIsRecording(false);
        setConnectionStatus('disconnected');
    }, []);

    // Reset transcript
    const resetTranscript = useCallback(() => {
        setTranscript('');
        setSegments([]);
        setError(null);
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopRecording();
        };
    }, [stopRecording]);

    return {
        isRecording,
        connectionStatus,
        transcript,
        segments,
        error,
        isSupported,
        startRecording,
        stopRecording,
        resetTranscript,
    };
}
