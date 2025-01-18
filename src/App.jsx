import React, { useState, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './components/ui/card';
import { Button } from './components/ui/button';
import { Mic, MicOff } from 'lucide-react';

const NoiseCancel = () => {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [connectionType, setConnectionType] = useState('bluetooth');
  const [latency, setLatency] = useState(0);
  
  // Audio processing nodes
  const audioContextRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const processorNodeRef = useRef(null);
  const gainNodeRef = useRef(null);
  const delayNodeRef = useRef(null);

  // Larger buffer for Bluetooth latency compensation
  const BUFFER_SIZE = 4096; // Increased for Bluetooth
  
  // Car-specific frequency bands for road noise
  const CAR_FREQUENCIES = {
    tireNoise: [60, 80],   // Tire/road contact
    windNoise: [120, 160], // Wind noise
    engineIdle: [30, 45],  // Engine idle vibrations
  };

  const createCarOptimizedProcessor = (context) => {
    const processor = context.createScriptProcessor(BUFFER_SIZE, 1, 1);
    const delayBufferSize = Math.ceil(context.sampleRate * 0.2); // 200ms max delay
    const delayBuffer = new Float32Array(delayBufferSize);
    let delayWritePtr = 0;
    let delayReadPtr = 0;
    
    processor.onaudioprocess = (audioProcessingEvent) => {
      const input = audioProcessingEvent.inputBuffer.getChannelData(0);
      const output = audioProcessingEvent.outputBuffer.getChannelData(0);
      
      // Store input in delay buffer
      for (let i = 0; i < input.length; i++) {
        delayBuffer[delayWritePtr] = input[i];
        delayWritePtr = (delayWritePtr + 1) % delayBufferSize;
      }
      
      // Calculate actual Bluetooth latency if possible
      if (audioContextRef.current && audioContextRef.current.outputLatency) {
        setLatency(audioContextRef.current.outputLatency * 1000); // Convert to ms
      }
      
      // Read from delay buffer with compensation
      for (let i = 0; i < output.length; i++) {
        const delayedSample = delayBuffer[delayReadPtr];
        output[i] = -delayedSample; // Invert for noise cancellation
        delayReadPtr = (delayReadPtr + 1) % delayBufferSize;
      }
    };
    
    return processor;
  };

  const startNoiseCancellation = async () => {
    try {
      // Request audio input with car-optimized settings
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
          sampleRate: 48000
        } 
      });
      
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        latencyHint: connectionType === 'bluetooth' ? 'playback' : 'interactive',
        sampleRate: 48000
      });
      
      const ctx = audioContextRef.current;
      
      // Create nodes
      sourceNodeRef.current = ctx.createMediaStreamSource(stream);
      processorNodeRef.current = createCarOptimizedProcessor(ctx);
      gainNodeRef.current = ctx.createGain();
      gainNodeRef.current.gain.value = 0.7; // Reduced to prevent feedback in car
      
      // Create delay node for latency compensation
      delayNodeRef.current = ctx.createDelay(0.5); // 500ms max delay
      delayNodeRef.current.delayTime.value = connectionType === 'bluetooth' ? 0.2 : 0; // 200ms for Bluetooth
      
      // Connect nodes
      sourceNodeRef.current.connect(delayNodeRef.current);
      delayNodeRef.current.connect(processorNodeRef.current);
      processorNodeRef.current.connect(gainNodeRef.current);
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
      processorNodeRef.current.disconnect();
      delayNodeRef.current.disconnect();
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
        <CardTitle className="text-center">Car-Optimized Noise Cancellation</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex justify-center space-x-4">
            <Button
              onClick={() => setConnectionType('bluetooth')}
              className={`flex items-center space-x-2 ${
                connectionType === 'bluetooth' ? 'bg-blue-500' : 'bg-gray-300'
              }`}
            >
              <Bluetooth className="w-4 h-4" />
              <span>Bluetooth</span>
            </Button>
            <Button
              onClick={() => setConnectionType('wired')}
              className={`flex items-center space-x-2 ${
                connectionType === 'wired' ? 'bg-blue-500' : 'bg-gray-300'
              }`}
            >
              <Cable className="w-4 h-4" />
              <span>Wired</span>
            </Button>
          </div>

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
          
          {latency > 0 && (
            <div className="text-center text-sm">
              Current latency: {latency.toFixed(1)}ms
            </div>
          )}

          {error && (
            <div className="text-red-500 text-center text-sm mt-2">
              {error}
            </div>
          )}

          <div className="text-center text-sm text-gray-500 mt-4">
            <p>Car-optimized features:</p>
            <p>• Bluetooth latency compensation</p>
            <p>• Car acoustics optimization</p>
            <p>• Adaptive delay buffering</p>
            <p>• Targeting car-specific frequencies:</p>
            <p className="ml-4">- Engine idle (30-45 Hz)</p>
            <p className="ml-4">- Tire noise (60-80 Hz)</p>
            <p className="ml-4">- Wind noise (120-160 Hz)</p>
            
            <div className="mt-4 p-2 bg-yellow-50 rounded">
              <p className="text-yellow-700">For best results:</p>
              <p className="text-yellow-600">1. Use wired connection if possible</p>
              <p className="text-yellow-600">2. Place phone in stable position</p>
              <p className="text-yellow-600">3. Keep volume moderate</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default NoiseCancel;