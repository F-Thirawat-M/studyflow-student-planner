(function (SF) {
  'use strict';

  // client ตัวเดียวใช้ร่วมกันทั้ง auth และ store (สร้างสองตัว session จะซ้ำกัน)
  const { url, key } = SF.supabaseConfig || {};
  SF.db = window.supabase && url && key ? window.supabase.createClient(url, key) : null;
})(window.StudyFlow = window.StudyFlow || {});
