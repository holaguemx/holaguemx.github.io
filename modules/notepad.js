(function() {
    const toggleBtn   = document.getElementById('notes-toggle');
    const panel       = document.getElementById('notes-panel');
    const saveBtn     = document.getElementById('save-note');
    const clearBtn    = document.getElementById('clear-notes');
    const input       = document.getElementById('note-input');
    const list        = document.getElementById('notes-list');
    const STORAGE_KEY = 'notePad';
    let notes = [];

    // Cargar notas al iniciar
    function loadNotes() {
      notes = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      renderNotes();
    }

    // Renderizar la lista de notas
    function renderNotes() {
      list.innerHTML = '';
      notes.forEach((text, i) => {
        const item = document.createElement('div');
        item.className = 'note-item';
        item.textContent = text;
        // botón para borrar nota individual
        const del = document.createElement('button');
        del.innerHTML = '✖️';
        del.title = 'Borrar nota';
        del.addEventListener('click', () => {
          notes.splice(i, 1);
          saveToStorage();
          renderNotes();
        });
        item.appendChild(del);
        list.appendChild(item);
      });
    }

    // Guardar array en localStorage
    function saveToStorage() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    }

    // Handlers
    toggleBtn.addEventListener('click', () => {
      panel.style.display = panel.style.display === 'flex' ? 'none' : 'flex';
    });

    saveBtn.addEventListener('click', () => {
      const text = input.value.trim();
      if (!text) return alert('Escribe algo antes de guardar.');
      notes.push(text);
      saveToStorage();
      renderNotes();
      input.value = '';
      input.focus();
    });

    clearBtn.addEventListener('click', () => {
      if (!notes.length || !confirm('¿Borrar todas las notas?')) return;
      notes = [];
      localStorage.removeItem(STORAGE_KEY);
      renderNotes();
    });

    // Inicializar
    loadNotes();
  })();