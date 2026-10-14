Component({
  properties: {
    plan: { type: Object, value: {} },
    actionState: { type: String, value: 'RECORDING' },
    errorMessage: { type: String, value: '' }
  },
  methods: {
    selectFallback(event) {
      this.triggerEvent('anchorselect', { anchor: event.detail.value });
    },
    completeRecording(event) {
      this.triggerEvent('recorded', Object.assign({}, event.detail || {}));
    },
    failRecording(event) {
      this.triggerEvent('recorded', {
        recorded: false,
        tempFilePath: '',
        durationMs: 0,
        fileSize: 0,
        errorType: event && event.detail && event.detail.errorType
          ? event.detail.errorType
          : 'RECORD_FAILED'
      });
    },
    retry() {
      this.triggerEvent('retry');
    },
    handleContextBack() {
      return false;
    }
  }
});
