// NoiseProcessor.js
export class NoiseProcessor {
  constructor(audioContext) {
    this.context = audioContext;
    this.nodes = {};
    this.config = {
      predictionBufferSize: 2048,
      patternLength: 512,
      lookAheadMs: 50,
      filterStages: [
        { frequency: 40, Q: 2.5, gain: -15 },  // Low rumble
        { frequency: 100, Q: 3.0, gain: -12 }, // Main road noise
        { frequency: 135, Q: 2.0, gain: -10 }, // Upper harmonics
        { frequency: 200, Q: 1.5, gain: -8 }   // Tire noise
      ]
    };
    
    // Pattern matching state
    this.pastPatterns = [];
    this.predictionWeights = [0.5, 0.3, 0.2]; // Weights for top 3 similar patterns
  }

  async initialize(inputStream) {
    try {
      // Create source node
      this.nodes.source = this.context.createMediaStreamSource(inputStream);
      
      // Create analyzer
      this.nodes.analyzer = this.context.createAnalyser();
      this.nodes.analyzer.fftSize = 2048;
      
      // Create predictive processor
      this.nodes.predictor = this._createPredictiveProcessor();
      
      // Create filters
      this.nodes.filters = this.config.filterStages.map(stage => 
        this._createFilter(stage.frequency, stage.Q, stage.gain)
      );
      
      // Create compressor
      this.nodes.compressor = this.context.createDynamicsCompressor();
      Object.assign(this.nodes.compressor, {
        threshold: { value: -24 },
        knee: { value: 30 },
        ratio: { value: 12 },
        attack: { value: 0.003 },
        release: { value: 0.25 }
      });
      
      // Create output gain
      this.nodes.outputGain = this.context.createGain();
      this.nodes.outputGain.gain.value = 0.8;
      
      // Connect nodes
      this._connectNodes();
      
      return true;
    } catch (error) {
      console.error('Initialization error:', error);
      throw error;
    }
  }

  _createPredictiveProcessor() {
    const processor = this.context.createScriptProcessor(1024, 1, 1);
    
    processor.onaudioprocess = (event) => {
      const inputData = event.inputBuffer.getChannelData(0);
      const outputData = event.outputBuffer.getChannelData(0);
      
      // Store current pattern
      this.pastPatterns.push(Array.from(inputData));
      if (this.pastPatterns.length > this.config.predictionBufferSize) {
        this.pastPatterns.shift();
      }
      
      // Generate and apply prediction
      const prediction = this._predictNextPattern(inputData);
      for (let i = 0; i < outputData.length; i++) {
        outputData[i] = prediction[i] || 0;
      }
    };
    
    return processor;
  }

  _predictNextPattern(currentPattern) {
    if (this.pastPatterns.length < 2) {
      return currentPattern;
    }

    const recentPattern = currentPattern.slice(-this.config.patternLength);
    
    // Calculate similarities with past patterns
    const similarities = this.pastPatterns.map(pattern => {
      let similarity = 0;
      const compareLength = Math.min(this.config.patternLength, pattern.length);
      
      for (let i = 0; i < compareLength; i++) {
        similarity += Math.abs(pattern[i] - recentPattern[i]);
      }
      
      return similarity;
    });
    
    // Find most similar patterns
    const mostSimilarIndices = similarities
      .map((sim, idx) => ({ sim, idx }))
      .sort((a, b) => a.sim - b.sim)
      .slice(0, 3)
      .map(item => item.idx);
    
    // Generate prediction
    const prediction = new Float32Array(this.config.patternLength);
    
    mostSimilarIndices.forEach((idx, weightIdx) => {
      const pattern = this.pastPatterns[idx];
      const weight = this.predictionWeights[weightIdx];
      
      for (let i = 0; i < this.config.patternLength; i++) {
        prediction[i] += (pattern[i] || 0) * weight;
      }
    });
    
    return prediction;
  }

  _createFilter(frequency, Q, gain) {
    const filter = this.context.createBiquadFilter();
    filter.type = 'peaking';
    filter.frequency.value = frequency;
    filter.Q.value = Q;
    filter.gain.value = gain;
    return filter;
  }

  _connectNodes() {
    // Connect main processing chain
    this.nodes.source.connect(this.nodes.analyzer);
    this.nodes.analyzer.connect(this.nodes.predictor);
    
    // Connect filters in series
    let currentNode = this.nodes.predictor;
    this.nodes.filters.forEach(filter => {
      currentNode.connect(filter);
      currentNode = filter;
    });
    
    // Connect output chain
    currentNode.connect(this.nodes.compressor);
    this.nodes.compressor.connect(this.nodes.outputGain);
    this.nodes.outputGain.connect(this.context.destination);
  }

  updateConfig(newConfig) {
    // Deep merge new config with existing
    this.config = {
      ...this.config,
      ...newConfig,
      filterStages: newConfig.filterStages || this.config.filterStages
    };
    
    // Update filter parameters if they exist
    if (this.nodes.filters) {
      this.config.filterStages.forEach((stage, index) => {
        if (this.nodes.filters[index]) {
          const filter = this.nodes.filters[index];
          filter.frequency.value = stage.frequency;
          filter.Q.value = stage.Q;
          filter.gain.value = stage.gain;
        }
      });
    }
  }

  getAnalyzerData() {
    const dataArray = new Uint8Array(this.nodes.analyzer.frequencyBinCount);
    this.nodes.analyzer.getByteFrequencyData(dataArray);
    return dataArray;
  }

  dispose() {
    // Disconnect and cleanup all nodes
    Object.values(this.nodes).forEach(node => {
      if (node && typeof node.disconnect === 'function') {
        node.disconnect();
      }
    });
    
    this.pastPatterns = [];
    this.nodes = {};
  }
}