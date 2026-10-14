Component({
  properties: {
    value: { type: String, value: '' },
    title: { type: String, value: '' },
    description: { type: String, value: '' },
    selected: { type: Boolean, value: false }
  },
  methods: {
    handleTap() {
      this.triggerEvent('select', { value: this.data.value, title: this.data.title });
    }
  }
});
