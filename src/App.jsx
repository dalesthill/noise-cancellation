import React, { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './components/ui/card';
import { Button } from './components/ui/button';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';

const NoiseCancel = () => {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  
  // Audio processing nodes
  const audioContextRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const analyzerNodeRef = useRef(null);
  const predictiveProcessorRef = useRef(null);
  const gainNodeRef = useRef(null);

  // Smaller buffer for lower latency
  const BUFFER_SIZE = 256; // Reduced from 1024
  const PREDICTION_BUFFER_SIZE = 512; // Reduced from 2048
  const PATTERN_LENGTH = 128; // Reduced from 512
  const pastPatternsRef = useRef([]);

  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const createPredictiveProcessor = (context) => {
    const processor = context.createScriptProcessor(BUFFER_SIZE, 1, 1);
    
    processor.onaudioprocess = (audioProcessingEvent) => {
      const inputBuffer = audioProcessingEvent.inputBuffer;
      const outputBuffer = audioProcessingEvent.outputBuffer;
      
      const inputData = inputBuffer.getChannelData(0);
      const outputData = outputBuffer.getChannelData(0);
      
      // Store current pattern
      pastPatternsRef.current.push(Array.from(inputData));
      if (pastPatternsRef.current.length > PREDICTION_BUFFER_SIZE) {
        pastPatternsRef.current.shift();
      }
      
      // Quick pattern matching for lower latency
      const prediction = predictNextPattern(inputData);
      
      // Direct sample processing
      for (let i = 0; i < outputData.length; i++) {
        // Blend prediction with inverted current sample for immediate effect
        outputData[i] = (-inputData[i] * 0.7) + (prediction[i] || 0) * 0.3;
      }
    };
    
    return processor;
  };

  const predictNextPattern = (currentPattern) => {
    if (pastPatternsRef.current.length < 2) {
      return currentPattern;
    }

    // Use smaller pattern length for faster matching
    const recentPattern = currentPattern.slice(-PATTERN_LENGTH);
    
    // Simplified similarity calculation
    let bestMatchIdx = 0;
    let bestSimilarity = Infinity;
    
    // Only check recent patterns for faster processing
    const recentHistoryStart = Math.max(0, pastPatternsRef.current.length - 8);
    
    for (let i = recentHistoryStart; i < pastPatternsRef.current.length; i++) {
      const pattern = pastPatternsRef.current[i];
      let similarity = 0;
      
      // Quick similarity check using fewer samples
      for (let j = 0; j < PATTERN_LENGTH; j += 4) {
        similarity += Math.abs(pattern[j] - recentPattern[j]);
      }
      
      if (similarity < bestSimilarity) {
        bestSimilarity = similarity;
        bestMatchIdx = i;
      }
    }
    
    // Return the best matching pattern
    return pastPatternsRef.current[bestMatchIdx] || currentPattern;
  };

  const startNoiseCancellation = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: false, // Disable browser processing
          noiseSuppression: false,
          autoGainControl: false,
          latency: 0, // Request minimal latency
        } 
      });
      
      // Initialize audio context with low latency options
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        latencyHint: 'interactive',
        sampleRate: 48000 // Higher sample rate for better quality
      });
      
      const ctx = audioContextRef.current;
      
      // Create source node
      sourceNodeRef.current = ctx.createMediaStreamSource(stream);
      
      // Create analyzer with smaller FFT size
      analyzerNodeRef.current = ctx.createAnalyser();
      analyzerNodeRef.current.fftSize = 512; // Reduced from 2048
      
      // Create predictive processor
      predictiveProcessorRef.current = createPredictiveProcessor(ctx);
      
      // Create output gain
      gainNodeRef.current = ctx.createGain();
      gainNodeRef.current.gain.value = 0.8;
      
      // Direct connection for minimal processing chain
      sourceNodeRef.current.connect(analyzerNodeRef.current);
      analyzerNodeRef.current.connect(predictiveProcessorRef.current);
      predictiveProcessorRef.current.connect(gainNodeRef.current);
      gainNodeRef.current.connect(ctx.destination);
      
      setIsListening(true);
      setIsProcessing(true);
      setError('');
    } catch (err) {
      setError('Error accessing microphone. Please ensure microphone permissions are granted.');
      console.error('Error:', err);
    }
  };

  const stopNoiseCancellation = () => {
    if (audioContextRef.current) {
      gainNodeRef.current.disconnect();
      predictiveProcessorRef.current.disconnect();
      analyzerNodeRef.current.disconnect();
      sourceNodeRef.current.disconnect();
      audioContextRef.current.close();
      audioContextRef.current = null;
      
      // Clear prediction buffers
      pastPatternsRef.current = [];
    }
    setIsListening(false);
    setIsProcessing(false);
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-center">Low-Latency Noise Cancellation</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex justify-center space-x-4">
            <Button
              onClick={isListening ? stopNoiseCancellation : startNoiseCancellation}
              className={`flex items-center space-x-2 ${
                isListening ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'
              }`}
            >
              {isListening ? (
                <>
                  <MicOff className="w-4 h-4" />
                  <span>Stop</span>
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4" />
                  <span>Start</span>
                </>
              )}
            </Button>
          </div>
          
          <div className="flex justify-center items-center space-x-2">
            <div className="text-sm text-gray-500">
              {isProcessing ? (
                <div className="flex items-center space-x-2">
                  <Volume2 className="w-4 h-4 animate-pulse" />
                  <span>Processing audio...</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <VolumeX className="w-4 h-4" />
                  <span>Not processing</span>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="text-red-500 text-center text-sm mt-2">
              {error}
            </div>
          )}

          <div className="text-center text-sm text-gray-500 mt-4">
            <p>Optimized for low latency:</p>
            <p>• Small buffer size (256 samples)</p>
            <p>• Direct sample processing</p>
            <p>• Minimal audio chain</p>
            <p>• Simplified pattern matching</p>
            <p className="mt-2">Features:</p>
            <p>• Direct noise inversion</p>
            <p>• Quick pattern prediction</p>
            <p>• Optimized processing chain</p>
            <p>• Browser optimizations disabled</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default NoiseCancel;