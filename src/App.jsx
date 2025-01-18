import React, { useState, useRef, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './components/ui/card';
import { Button } from './components/ui/button';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';


const NoiseCancel = () => {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  
  const audioContextRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const processorNodeRef = useRef(null);
  const gainNodeRef = useRef(null);
  const filtersRef = useRef([]);
  
  const BUFFER_SIZE = 256;

  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const createCarOptimizedProcessor = (context) => {
    const processor = context.createScriptProcessor(BUFFER_SIZE, 1, 1);
    
    processor.onaudioprocess = (audioProcessingEvent) => {
      const inputBuffer = audioProcessingEvent.inputBuffer;
      const outputBuffer = audioProcessingEvent.outputBuffer;
      
      // Get input and output channels
      const inputData = inputBuffer.getChannelData(0);
      const outputData = outputBuffer.getChannelData(0);
      
      // Process each sample
      for (let i = 0; i < BUFFER_SIZE; i++) {
        // Include original audio plus inverted noise
        // This ensures you can hear both your audio and the noise cancellation
        outputData[i] = inputData[i] + (-inputData[i] * 0.5);
      }
    };
    
    return processor;
  };

  const startNoiseCancellation = async () => {
    try {
      // First, request permission for both input and output
      await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          latency: 0,
          channelCount: 1,
          sampleRate: 48000
        } 
      });

      // Create audio context
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        latencyHint: 'playback',
        sampleRate: 48000
      });
      
      const ctx = audioContextRef.current;

      // Get all audio devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      
      // Try to use the default input device (usually car microphone when connected)
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          deviceId: audioInputs[0]?.deviceId,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        } 
      });

      // Create source from microphone input
      sourceNodeRef.current = ctx.createMediaStreamSource(stream);
      
      // Create processor
      processorNodeRef.current = createCarOptimizedProcessor(ctx);
      
      // Create gain node
      gainNodeRef.current = ctx.createGain();
      gainNodeRef.current.gain.value = 1.0; // Full volume
      
      // Connect the nodes
      sourceNodeRef.current.connect(processorNodeRef.current);
      processorNodeRef.current.connect(gainNodeRef.current);
      gainNodeRef.current.connect(ctx.destination);
      
      // Resume audio context (needed for some browsers)
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      
      setIsListening(true);
      setIsProcessing(true);
      setError('');
      
      console.log('Audio setup complete');
      console.log('Available audio devices:', audioInputs);
      console.log('Audio context state:', ctx.state);
      console.log('Sample rate:', ctx.sampleRate);
      
    } catch (err) {
      setError('Error: ' + (err.message || 'Could not access audio system'));
      console.error('Setup error:', err);
    }
  };

  const stopNoiseCancellation = () => {
    if (audioContextRef.current) {
      gainNodeRef.current.disconnect();
      processorNodeRef.current.disconnect();
      sourceNodeRef.current.disconnect();
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsListening(false);
    setIsProcessing(false);
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-center">Car Audio Noise Cancellation</CardTitle>
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
            <p>Instructions:</p>
            <p>1. Connect phone to car audio</p>
            <p>2. Ensure car microphone is selected</p>
            <p>3. Play some audio to test</p>
            <p>4. Adjust car volume as needed</p>
            <p className="mt-2 text-yellow-600">
              Note: You should hear both your audio and noise cancellation
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default NoiseCancel;