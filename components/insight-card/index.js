const { ISSUE_TYPES } = require('../../utils/constants');

Component({
  properties: {
    diagnosis: { type: Object, value: {} },
    insightCopy: { type: Object, value: {} },
    question: { type: Object, value: {} },
    inlineActive: { type: Boolean, value: false }
  },
  data: {
    issueTypes: ISSUE_TYPES
  },
  methods: {
    handlePrimary() {
      this.triggerEvent('primary');
    },
    handleSecondary() {
      this.triggerEvent('secondary');
    }
  }
});
