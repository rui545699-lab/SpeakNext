const RECORDER_STATES = Object.freeze({
  IDLE: 'IDLE',
  STARTING: 'STARTING',
  RECORDING: 'RECORDING',
  STOPPING: 'STOPPING'
});

// wx.getRecorderManager() returns one app-wide manager. Keep ownership here so
// overlapping component lifetimes cannot both operate it.
let activeRecorderOwner = null;
let pendingRecorderOwner = null;

Component({
  properties: {
    mode: { type: String, value: 'long' },
    buttonLabel: { type: String, value: '说完了' },
    maxSeconds: { type: Number, value: 0 },
    hint: { type: String, value: '' }
  },
  data: {
    seconds: 0,
    displayTime: '00:00',
    recordingAvailable: true,
    levels: [22, 38, 58, 34, 72, 46, 28, 52, 66, 36, 24]
  },
  lifetimes: {
    attached() {
      this.detachedFlag = false;
      this.completed = false;
      this.pendingStop = false;
      this.recorderState = RECORDER_STATES.IDLE;
      this.setupRecorder();
      this.start();
    },
    detached() {
      this.detachedFlag = true;
      this.stopTimer();
      if (pendingRecorderOwner === this) pendingRecorderOwner = null;
      if (activeRecorderOwner !== this || this.recorderState === RECORDER_STATES.IDLE) {
        this.removeRecorderListeners();
        return;
      }
      if (this.recorderState === RECORDER_STATES.RECORDING) {
        this.finish();
        return;
      }
      if (this.recorderState === RECORDER_STATES.STARTING) {
        this.pendingStop = true;
      }
      // STOPPING/STARTING must keep listeners until onStop/onError resets the
      // app-wide manager and releases ownership.
    }
  },
  methods: {
    setRecorderState(nextState) {
      const previous = this.recorderState || RECORDER_STATES.IDLE;
      if (previous === nextState) return;
      console.log(`[RECORDER STATE] ${previous} -> ${nextState}`);
      this.recorderState = nextState;
    },
    setupRecorder() {
      if (!wx.getRecorderManager) {
        this.recordErrorType = 'RECORD_FAILED';
        console.error('[RECORDER] error', { errMsg: 'getRecorderManager unavailable' });
        return;
      }
      this.recorderManager = wx.getRecorderManager();
      this.handleManagerStart = () => {
        if (activeRecorderOwner !== this || this.recorderState !== RECORDER_STATES.STARTING) return;
        console.log('[RECORDER] onStart');
        this.setRecorderState(RECORDER_STATES.RECORDING);
        if (this.pendingStop || this.detachedFlag) this.finish();
      };
      this.handleManagerStop = (result = {}) => {
        if (activeRecorderOwner !== this) return;
        if (this.recorderState === RECORDER_STATES.RECORDING) {
          this.setRecorderState(RECORDER_STATES.STOPPING);
        }
        console.log('[RECORDER] onStop', {
          tempFilePath: result.tempFilePath || '',
          duration: result.duration,
          fileSize: result.fileSize
        });
        this.setRecorderState(RECORDER_STATES.IDLE);
        activeRecorderOwner = null;
        this.pendingStop = false;
        this.resolveStopWaiters();
        const durationMs = Number(result.duration) || 0;
        const fileSize = Number(result.fileSize) || 0;
        const validAudio = Boolean(result.tempFilePath) && durationMs > 500 && fileSize > 0;
        if (!validAudio) {
          console.error('[RECORDER] invalid audio', {
            errorType: 'EMPTY_AUDIO',
            hasTempFilePath: Boolean(result.tempFilePath),
            duration: durationMs,
            fileSize
          });
        }
        this.emitComplete({
          tempFilePath: result.tempFilePath || '',
          durationMs,
          fileSize,
          recorded: validAudio,
          errorType: validAudio ? '' : 'EMPTY_AUDIO'
        });
        if (this.detachedFlag) this.removeRecorderListeners();
        this.startPendingOwner();
      };
      this.handleManagerError = (error) => {
        if (activeRecorderOwner !== this) return;
        const errMsg = error && error.errMsg ? error.errMsg : '';
        const errorType = /auth|authorize|permission|scope\.record|deny/i.test(errMsg)
          ? 'RECORD_PERMISSION_FAILED'
          : 'RECORD_FAILED';
        console.error('[RECORDER] error', { errMsg });
        if (activeRecorderOwner === this) activeRecorderOwner = null;
        this.pendingStop = false;
        this.setRecorderState(RECORDER_STATES.IDLE);
        this.resolveStopWaiters();
        this.recordErrorType = errorType;
        this.setData({ recordingAvailable: false });
        if (!this.detachedFlag) {
          this.triggerEvent('error', { errorType, errMsg });
          wx.showToast({ title: '未能使用麦克风，请检查权限', icon: 'none' });
        } else {
          this.removeRecorderListeners();
        }
        this.startPendingOwner();
      };
      this.recorderManager.onStart(this.handleManagerStart);
      this.recorderManager.onStop(this.handleManagerStop);
      this.recorderManager.onError(this.handleManagerError);
    },
    startPendingOwner() {
      const pending = pendingRecorderOwner;
      pendingRecorderOwner = null;
      if (!pending || pending.detachedFlag) return;
      // Let every listener finish handling the old owner's onStop event before
      // the next owner enters STARTING. This is event serialization, not retry.
      Promise.resolve().then(() => {
        if (!pending.detachedFlag) pending.start();
      });
    },
    removeRecorderListeners() {
      if (!this.recorderManager || this.listenersRemoved) return;
      this.listenersRemoved = true;
      if (this.recorderManager.offStart) this.recorderManager.offStart(this.handleManagerStart);
      if (this.recorderManager.offStop) this.recorderManager.offStop(this.handleManagerStop);
      if (this.recorderManager.offError) this.recorderManager.offError(this.handleManagerError);
    },
    start() {
      if (!this.recorderState) this.recorderState = RECORDER_STATES.IDLE;
      if (this.detachedFlag || this.recorderState !== RECORDER_STATES.IDLE) return;
      if (!this.recorderManager) return;
      if (activeRecorderOwner && activeRecorderOwner !== this) {
        pendingRecorderOwner = this;
        return;
      }

      activeRecorderOwner = this;
      this.setRecorderState(RECORDER_STATES.STARTING);
      this.triggerEvent('start');
      const seconds = this.data.maxSeconds || (this.data.mode === 'short' ? 30 : 60);
      try {
        console.log('[RECORDER] start called');
        this.recorderManager.start({
          duration: seconds * 1000,
          sampleRate: 16000,
          numberOfChannels: 1,
          encodeBitRate: 48000,
          format: 'mp3'
        });
      } catch (error) {
        const errMsg = error && error.errMsg ? error.errMsg : String(error && error.message || '');
        console.error('[RECORDER] error', { errMsg });
        if (activeRecorderOwner === this) activeRecorderOwner = null;
        this.setRecorderState(RECORDER_STATES.IDLE);
        this.recordErrorType = 'RECORD_FAILED';
        this.setData({ recordingAvailable: false });
        this.triggerEvent('error', { errorType: 'RECORD_FAILED', errMsg });
        this.startPendingOwner();
        return;
      }
      this.timer = setInterval(() => {
        const elapsedSeconds = this.data.seconds + 1;
        const displayTime = `00:${String(elapsedSeconds).padStart(2, '0')}`;
        const levels = this.data.levels.map(() => 20 + Math.floor(Math.random() * 56));
        this.setData({ seconds: elapsedSeconds, displayTime, levels });
        if (this.data.maxSeconds && elapsedSeconds >= this.data.maxSeconds) this.finish();
      }, 1000);
    },
    stopTimer() {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
    },
    resolveStopWaiters() {
      const waiters = this.stopWaiters || [];
      this.stopWaiters = [];
      waiters.forEach((resolve) => resolve());
    },
    stopForExit() {
      if (!this.recorderState || this.recorderState === RECORDER_STATES.IDLE) {
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        this.stopWaiters = this.stopWaiters || [];
        this.stopWaiters.push(resolve);
        this.finish();
      });
    },
    finish() {
      if (!this.recorderState) this.recorderState = RECORDER_STATES.IDLE;
      if (this.recorderState === RECORDER_STATES.IDLE
        || this.recorderState === RECORDER_STATES.STOPPING) return;
      this.stopTimer();
      if (this.recorderState === RECORDER_STATES.STARTING) {
        this.pendingStop = true;
        return;
      }
      if (activeRecorderOwner !== this || !this.recorderManager) return;
      this.setRecorderState(RECORDER_STATES.STOPPING);
      try {
        console.log('[RECORDER] stop called');
        this.recorderManager.stop();
      } catch (error) {
        const errMsg = error && error.errMsg ? error.errMsg : String(error && error.message || '');
        console.error('[RECORDER] error', { errMsg });
        if (activeRecorderOwner === this) activeRecorderOwner = null;
        this.setRecorderState(RECORDER_STATES.IDLE);
        this.resolveStopWaiters();
        this.recordErrorType = 'RECORD_FAILED';
        this.emitComplete({
          recorded: false,
          tempFilePath: '',
          durationMs: 0,
          fileSize: 0,
          errorType: 'RECORD_FAILED'
        });
        if (this.detachedFlag) this.removeRecorderListeners();
        this.startPendingOwner();
      }
    },
    emitComplete(extra) {
      if (this.completed || this.detachedFlag) return;
      this.completed = true;
      this.stopTimer();
      this.triggerEvent('complete', Object.assign({
        duration: this.data.seconds,
        recorded: false,
        tempFilePath: '',
        durationMs: 0,
        fileSize: 0,
        errorType: ''
      }, extra || {}));
    }
  }
});
