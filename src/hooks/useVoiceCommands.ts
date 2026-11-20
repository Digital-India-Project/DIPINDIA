import { useCallback, useEffect, useRef, useState } from 'react';
import type { NavModule, SupportedLang, ThemeMode } from '../types/platform';

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionEventLike {
  results: {
    [index: number]: {
      [altIndex: number]: {
        transcript: string;
      };
    };
  };
}

interface VoiceCommandHandlers {
  onNavigate: (module: NavModule) => void;
  onThemeChange: (theme: ThemeMode) => void;
  onLangChange: (lang: SupportedLang) => void;
  onCreateBackup: () => void;
  onLockVault: () => void;
  onSyncQueue: () => void;
}

export function useVoiceCommands(handlers: VoiceCommandHandlers) {
  const [isListening, setIsListening] = useState(false);
  const [lastTranscript, setLastTranscript] = useState<string>('');
  const [lastFeedback, setLastFeedback] = useState<string>('');
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const isSupported =
    typeof window !== 'undefined' &&
    Boolean(
      (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
    );

  const executeTextCommand = useCallback(
    (rawText: string): string => {
      const cmd = rawText.trim().toLowerCase();
      setLastTranscript(rawText.trim());

      if (cmd.includes('dashboard') || cmd.includes('command') || cmd.includes('home')) {
        handlers.onNavigate('dashboard');
        return 'Navigated to Command Desk';
      }
      if (cmd.includes('karta') || cmd.includes('file') || cmd.includes('vault')) {
        handlers.onNavigate('karta-files');
        return 'Opened Karta Files vault';
      }
      if (cmd.includes('tool') || cmd.includes('tray')) {
        handlers.onNavigate('tools-tray');
        return 'Opened Tools-Tray';
      }
      if (cmd.includes('migration') || cmd.includes('r2') || cmd.includes('r1') || cmd.includes('d1') || cmd.includes('d2') || cmd.includes('schema')) {
        handlers.onNavigate('migration');
        return 'Opened R1/R2 & D1/D2 Schema Registry';
      }
      if (cmd.includes('audit') || cmd.includes('log') || cmd.includes('compliance')) {
        handlers.onNavigate('audit');
        return 'Opened Audit Logs';
      }
      if (cmd.includes('security') || cmd.includes('rbac') || cmd.includes('backup') || cmd.includes('biometric')) {
        handlers.onNavigate('security');
        return 'Opened RBAC & Security Center';
      }
      if (cmd.includes('doc') || cmd.includes('manual') || cmd.includes('api')) {
        handlers.onNavigate('docs');
        return 'Opened Proprietary Engineering Docs';
      }
      if (cmd.includes('dark')) {
        handlers.onThemeChange('dark');
        return 'Switched to Dark Mode';
      }
      if (cmd.includes('light')) {
        handlers.onThemeChange('light');
        return 'Switched to Light Mode';
      }
      if (cmd.includes('hindi')) {
        handlers.onLangChange('hi');
        return 'Language switched to Hindi';
      }
      if (cmd.includes('tamil')) {
        handlers.onLangChange('ta');
        return 'Language switched to Tamil';
      }
      if (cmd.includes('spanish')) {
        handlers.onLangChange('es');
        return 'Language switched to Spanish';
      }
      if (cmd.includes('japanese')) {
        handlers.onLangChange('ja');
        return 'Language switched to Japanese';
      }
      if (cmd.includes('english')) {
        handlers.onLangChange('en');
        return 'Language switched to English';
      }
      if (cmd.includes('create backup') || cmd.includes('backup now')) {
        handlers.onCreateBackup();
        return 'Triggered encrypted cloud backup';
      }
      if (cmd.includes('lock')) {
        handlers.onLockVault();
        return 'Locked Karta Files passphrase session';
      }
      if (cmd.includes('sync')) {
        handlers.onSyncQueue();
        return 'Triggered offline queue synchronization';
      }
      return `Command not matched: "${rawText.trim()}"`;
    },
    [handlers]
  );

  const toggleListening = useCallback(() => {
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const SpeechCtor =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionInstance })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionInstance })
        .webkitSpeechRecognition;

    if (!SpeechCtor) {
      setLastFeedback('Browser speech recognition unavailable; use the Voice Console text runner.');
      return;
    }

    const recognition = new SpeechCtor();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      const result = executeTextCommand(transcript);
      setLastFeedback(result);
    };

    recognition.onerror = (event) => {
      setLastFeedback(`Voice recognition notice: ${event.error}`);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  }, [executeTextCommand, isListening]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  return {
    isSupported,
    isListening,
    lastTranscript,
    lastFeedback,
    toggleListening,
    executeTextCommand: (text: string) => {
      const feedback = executeTextCommand(text);
      setLastFeedback(feedback);
      return feedback;
    },
  };
}
