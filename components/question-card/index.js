Component({
  properties: {
    question: { type: Object, value: {} }
  },
  methods: {
    handleChange() {
      this.triggerEvent('change');
    }
  }
});
