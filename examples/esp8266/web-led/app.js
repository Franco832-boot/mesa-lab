const spanish = document.documentElement.lang === 'es';
document.querySelector('#on').textContent = spanish ? 'Encender LED' : 'Turn LED on';
document.querySelector('#off').textContent = spanish ? 'Apagar LED' : 'Turn LED off';
document.querySelector('#refresh').textContent = spanish ? 'Consultar D5' : 'Read D5';

async function update(path) {
  const result = await fetch(path);
  if (!result.ok) throw new Error('HTTP ' + result.status);
  const state = await result.text();
  document.querySelector('#status').textContent = spanish
    ? 'D5: ' + (state === 'ON' ? 'encendido' : 'apagado')
    : 'D5: ' + state;
}
document.querySelector('#on').addEventListener('click', () => update('/led/on'));
document.querySelector('#off').addEventListener('click', () => update('/led/off'));
document.querySelector('#refresh').addEventListener('click', () => update('/led/state'));
update('/led/state');
