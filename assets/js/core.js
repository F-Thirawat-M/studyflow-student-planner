(function (SF) {
  'use strict';

  const DAY_MS = 86_400_000;

  function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function parseDate(value) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  // id ของงานเป็น uuid เต็มเพราะคอลัมน์ tasks.id ในฐานข้อมูลเป็นชนิด uuid
  function newUuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));
  }

  SF.config = Object.freeze({
    newTaskId: '__new__',
    maxCalendarTasks: 3,
  });

  SF.date = {
    format: formatDate,
    today: () => formatDate(new Date()),
    parse: parseDate,
    addDays(value, amount) {
      const date = parseDate(value);
      date.setDate(date.getDate() + amount);
      return formatDate(date);
    },
    diffDays(a, b) {
      return Math.round((parseDate(a) - parseDate(b)) / DAY_MS);
    },
    max(a, b) { return this.diffDays(a, b) >= 0 ? a : b; },
    min(a, b) { return this.diffDays(a, b) <= 0 ? a : b; },
    display(value) {
      return parseDate(value).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
    },
    startOfWeek(value) {
      const date = new Date(value);
      const offset = date.getDay() === 0 ? -6 : 1 - date.getDay();
      date.setDate(date.getDate() + offset);
      date.setHours(0, 0, 0, 0);
      return date;
    },
  };

  SF.utils = {
    select: (selector, scope = document) => scope.querySelector(selector),
    selectAll: (selector, scope = document) => [...scope.querySelectorAll(selector)],
    uid: newUuid,
    escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      })[character]);
    },
  };
})(window.StudyFlow = window.StudyFlow || {});
