import { useEffect, useRef, useState } from 'react';
import { getReceptionistSpeech, transcribeReceptionistAudio } from '../api';

export function useVoiceReceptionist(onFinalTurn: (text: string) => void) {
  const onFinalTurnRef = useRef(onFinalTurn);
  const recognition = useRef<SpeechRecognition>();
  const latestTranscript = useRef('');
  const deliveredTranscript = useRef(false);
  const audioContext = useRef<AudioContext>();
  const audioSource = useRef<AudioBufferSourceNode>();
  const speechRequest = useRef<AbortController>();
  const mediaStream = useRef<MediaStream>();
  const recorder = useRef<MediaRecorder>();
  const audioChunks = useRef<Blob[]>([]);
  const recordingStartedAt = useRef(0);
  const speechGeneration = useRef(0);
  const activeSession = useRef<string>();
  const [supported] = useState(() =>
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  );
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState('');
  const [voiceSource, setVoiceSource] = useState<'google' | 'browser' | null>(null);
  const [lastTranscript, setLastTranscript] = useState('');
  useEffect(() => {
    onFinalTurnRef.current = onFinalTurn;
  }, [onFinalTurn]);
  useEffect(
    () => () => {
      endSession();
    },
    []
  );
  function stopSpeaking() {
    speechGeneration.current += 1;
    speechRequest.current?.abort();
    speechRequest.current = undefined;
    audioSource.current?.stop();
    audioSource.current = undefined;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }
  function unlockCloudAudio() {
    if (!audioContext.current) audioContext.current = new AudioContext();
    if (audioContext.current.state === 'suspended') void audioContext.current.resume();
    return audioContext.current;
  }
  function speakWithBrowser(text: string, onComplete?: () => void) {
    setVoiceSource('browser');
    if (!('speechSynthesis' in window)) {
      setError('Speech output is not supported in this browser.');
      return;
    }
    stopSpeaking();
    const generation = speechGeneration.current;
    window.speechSynthesis.resume();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.94;
    utterance.pitch = 1;
    utterance.volume = 1;
    setSpeaking(true);
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => {
      setSpeaking(false);
      if (speechGeneration.current === generation) onComplete?.();
    };
    utterance.onerror = () => {
      setSpeaking(false);
      setError(
        'Speech output was blocked or unavailable. Check your browser and system sound settings.'
      );
    };
    window.speechSynthesis.speak(utterance);
  }
  async function speak(text: string, sessionId?: string, onComplete?: () => void) {
    if (sessionId) activeSession.current = sessionId;
    if (!sessionId) return speakWithBrowser(text, onComplete);
    stopSpeaking();
    const generation = speechGeneration.current;
    const controller = new AbortController();
    speechRequest.current = controller;
    setSpeaking(true);
    try {
      const blob = await getReceptionistSpeech(sessionId, controller.signal);
      if (controller.signal.aborted) return;
      const context = unlockCloudAudio();
      const buffer = await context.decodeAudioData(await blob.arrayBuffer());
      if (controller.signal.aborted) return;
      const source = context.createBufferSource();
      const gain = context.createGain();
      const compressor = context.createDynamicsCompressor();
      source.buffer = buffer;
      gain.gain.value = 1.28;
      compressor.threshold.value = -18;
      compressor.knee.value = 18;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.18;
      source.connect(gain).connect(compressor).connect(context.destination);
      audioSource.current = source;
      setVoiceSource('google');
      setError('');
      source.onended = () => {
        if (audioSource.current === source) {
          audioSource.current = undefined;
          setSpeaking(false);
          if (speechGeneration.current === generation) onComplete?.();
        }
      };
      source.start();
    } catch {
      if (!controller.signal.aborted) {
        setError('Cloud voice was unavailable, so the browser voice was used instead.');
        speakWithBrowser(text, onComplete);
      }
    } finally {
      if (speechRequest.current === controller) speechRequest.current = undefined;
    }
  }
  function start() {
    const Constructor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Constructor) return;
    unlockCloudAudio();
    stopSpeaking();
    window.speechSynthesis.resume();
    setSpeaking(false);
    setError('');
    latestTranscript.current = '';
    deliveredTranscript.current = false;
    const instance = new Constructor();
    recognition.current = instance;
    instance.lang = navigator.language;
    instance.continuous = false;
    instance.interimResults = true;
    startRecording();
    instance.onresult = (event) => {
      let transcript = '';
      let finalText = '';
      for (let i = 0; i < event.results.length; i += 1) {
        const item = event.results[i];
        if (item.isFinal) finalText += item[0].transcript;
        transcript += item[0].transcript;
      }
      latestTranscript.current = transcript.trim();
      setInterim(finalText ? '' : latestTranscript.current);
      if (thisIsMeaningfulTurn(finalText)) latestTranscript.current = finalText.trim();
    };
    instance.onend = () => {
      finishTurn();
    };
    instance.onerror = (event) => {
      finishTurn();
      if (event.error !== 'aborted')
        setError(
          event.error === 'not-allowed'
            ? 'Microphone access is blocked. Allow it in your browser settings, then try again.'
            : `Voice recognition failed (${event.error}). Try typing your message instead.`
        );
    };
    setListening(true);
    try {
      instance.start();
    } catch {
      setListening(false);
      void stopRecording();
      setError('Voice recognition could not start. Please try again or type your message.');
    }
  }
  async function prepareMicrophone() {
    if (!navigator.mediaDevices?.getUserMedia) return;
    mediaStream.current ??= await navigator.mediaDevices.getUserMedia({ audio: true });
  }
  function startRecording() {
    if (!mediaStream.current || typeof MediaRecorder === 'undefined') return;
    audioChunks.current = [];
    try {
      recorder.current = new MediaRecorder(mediaStream.current, { mimeType: 'audio/webm' });
    } catch {
      recorder.current = new MediaRecorder(mediaStream.current);
    }
    recorder.current.ondataavailable = (event) =>
      event.data.size && audioChunks.current.push(event.data);
    recordingStartedAt.current = Date.now();
    recorder.current.start();
  }
  function stopRecording() {
    return new Promise<{ audio?: Blob; durationSeconds: number }>((resolve) => {
      const durationSeconds = Math.max(1, (Date.now() - recordingStartedAt.current) / 1000);
      if (!recorder.current || recorder.current.state === 'inactive')
        return resolve({ durationSeconds });
      recorder.current.onstop = () =>
        resolve({ audio: new Blob(audioChunks.current, { type: 'audio/webm' }), durationSeconds });
      recorder.current.stop();
    });
  }
  async function deliverTurn(browserTranscript: string) {
    if (deliveredTranscript.current) return;
    deliveredTranscript.current = true;
    setInterim('');
    try {
      const recording = await stopRecording();
      const cloud = recording.audio
        ? await transcribeReceptionistAudio(recording.audio, recording.durationSeconds, undefined, activeSession.current)
        : undefined;
      const transcript = cloud?.transcript?.trim() || browserTranscript;
      setLastTranscript(transcript);
      onFinalTurnRef.current(transcript);
    } catch {
      setLastTranscript(browserTranscript);
      onFinalTurnRef.current(browserTranscript);
    }
  }
  function finishTurn() {
    setListening(false);
    if (deliveredTranscript.current) return;
    if (thisIsMeaningfulTurn(latestTranscript.current)) {
      void deliverTurn(latestTranscript.current);
      return;
    }
    deliveredTranscript.current = true;
    void stopRecording();
  }
  function endSession() {
    deliveredTranscript.current = true;
    recognition.current?.stop();
    recognition.current = undefined;
    activeSession.current = undefined;
    void stopRecording();
    mediaStream.current?.getTracks().forEach((track) => track.stop());
    mediaStream.current = undefined;
    stopSpeaking();
  }
  return {
    supported,
    listening,
    speaking,
    interim,
    error,
    voiceSource,
    lastTranscript,
    start,
    stop: () => recognition.current?.stop(),
    speak,
    prepareMicrophone,
    enableSpeech: () => window.speechSynthesis?.resume(),
    stopSpeaking,
    endSession
  };
}

function thisIsMeaningfulTurn(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[.!?,]+$/g, '');
  return !['um', 'uh', 'erm', 'hmm', 'mm', 'okay', 'ok', 'one second', 'just a second'].includes(
    normalized
  );
}
