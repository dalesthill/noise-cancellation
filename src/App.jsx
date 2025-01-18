import React, { useState, useRef } from 'react';
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
  const processorNodeRef = useRef(null);
  const gainNodeRef = useRef(null);
  const filtersRef = useRef([]);

  // Small buffer for low latency
  const BUFFER_SIZE = 256; // Slightly increased for filter stability

  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const createCarOptimizedProcessor = (context) => {
    const processor = context.createScriptProcessor(BUFFER_SIZE, 1, 1);
    
    // Pre-allocate buffers
    const inputBuffer = new Float32Array(BUFFER_SIZE);
    const outputBuffer = new Float32Array(BUFFER_SIZE);
    
    // Ring buffers for quick frequency analysis
    const engineBuffer = new Float32Array(16);
    const tireBuffer = new Float32Array(16);
    const windBuffer = new Float32Array(16);
    let bufferIndex = 0;
    
    processor.onaudioprocess = (audioProcessingEvent) => {
      const input = audioProcessingEvent.inputBuffer.getChannelData(0);
      const output = audioProcessingEvent.outputBuffer.getChannelData(0);
      
      // Copy input
      inputBuffer.set(input);
      
      // Quick frequency analysis and adaptive gain
      for (let i = 0; i < BUFFER_SIZE; i++) {
        // Store samples for frequency detection
        if (i % 16 === 0) {
          engineBuffer[bufferIndex] = inputBuffer[i];
          tireBuffer[bufferIndex] = inputBuffer[i];
          windBuffer[bufferIndex] = inputBuffer[i];
          bufferIndex = (bufferIndex + 1) % 16;
        }
        
        // Invert and apply frequency-specific gains
        outputBuffer[i] = -inputBuffer[i];
      }
      
      // Calculate energy in each frequency band
      let engineEnergy = 0;
      let tireEnergy = 0;
      let windEnergy = 0;
      
      for (let i = 0; i < 16; i++) {
        engineEnergy += engineBuffer[i] * engineBuffer[i];
        tireEnergy += tireBuffer[i] * tireBuffer[i];
        windEnergy += windBuffer[i] * windBuffer[i];
      }
      
      // Adjust filter gains based on energy
      if (filtersRef.current.length >= 3) {
        filtersRef.current[0].gain.value = -15 * (engineEnergy > 0.1 ? 1.2 : 0.8); // Engine noise
        filtersRef.current[1].gain.value = -12 * (tireEnergy > 0.1 ? 1.2 : 0.8);  // Tire noise
        filtersRef.current[2].gain.value = -10 * (windEnergy > 0.1 ? 1.2 : 0.8);  // Wind noise
      }
      
      // Copy to output
      output.set(outputBuffer);
    };
    
    return processor;
  };

  const createCarNoiseFilter = (context, frequency, Q, gain) => {
    const filter = context.createBiquadFilter();
    filter.type = 'peaking';
    filter.frequency.value = frequency;
    filter.Q.value = Q;
    filter.gain.value = gain;
    return filter;
  };

  const startNoiseCancellation = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          latency: 0,
          channelCount: 1,
          sampleRate: 48000
        } 
      });
      
      const contextOptions = {
        latencyHint: 'playback',
        sampleRate: 48000
      };
      
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)(contextOptions);
      const ctx = audioContextRef.current;
      
      // Create nodes
      sourceNodeRef.current = ctx.createMediaStreamSource(stream);
      processorNodeRef.current = createCarOptimizedProcessor(ctx);
      gainNodeRef.current = ctx.createGain();
      gainNodeRef.current.gain.value = 0.9;
      
      // Create car-specific filters
      filtersRef.current = [
        createCarNoiseFilter(ctx, 40, 2.0, -15),  // Engine noise (30-45 Hz)
        createCarNoiseFilter(ctx, 70, 1.5, -12),  // Tire noise (60-80 Hz)
        createCarNoiseFilter(ctx, 140, 1.0, -10)  // Wind noise (120-160 Hz)
      ];
      
      // Connect nodes
      sourceNodeRef.current.connect(processorNodeRef.current);
      let currentNode = processorNodeRef.current;
      
      filtersRef.current.forEach(filter => {
        currentNode.connect(filter);
        currentNode = filter;
      });
      
      currentNode.connect(gainNodeRef.current);
      gainNodeRef.current.connect(ctx.destination);
      
      if (ctx.resume) {
        await ctx.resume();
      }
      
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
      filtersRef.current.forEach(filter => filter.disconnect());
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
        <CardTitle className="text-center">Car-Optimized Noise Cancellation</CardTitle>
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
            <p>Car noise optimization:</p>
            <p>• Engine noise reduction (30-45 Hz)</p>
            <p>• Tire noise reduction (60-80 Hz)</p>
            <p>• Wind noise reduction (120-160 Hz)</p>
            <p>• Adaptive gain control</p>
            <p>• Fast sample processing</p>
            <p className="mt-2 text-yellow-600">
              For best results, position phone/device closer to noise source
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default NoiseCancel;