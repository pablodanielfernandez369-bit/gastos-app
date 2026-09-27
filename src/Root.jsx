import { useEffect, useState } from 'react';
import App from './App';
import { getActiveWalletId, setActiveWalletId, fetchWallets, createWallet, deleteWallet } from './lib/storage';

// Envoltorio fino: no hay pantalla de selección obligatoria (a diferencia de
// gastoscorujo) — la app abre directo en la última billetera activa de este
// dispositivo. Crear/cambiar/borrar billeteras vive dentro de Ajustes
// (ver App.jsx/Ajustes.jsx). Cambiar de billetera remonta <App> entera
// (key={walletId}) para que useAppState arranque de cero, limpio.
export default function Root() {
  const [walletId, setWalletId] = useState(getActiveWalletId);
  const [wallets, setWallets] = useState([{ id: 'main', name: 'Principal' }]);

  useEffect(() => {
    let cancelled = false;
    fetchWallets()
      .then((list) => { if (!cancelled && list?.length) setWallets(list); })
      .catch(() => { /* sin conexión: queda la default de arriba */ });
    return () => { cancelled = true; };
  }, []);

  function switchWallet(id) {
    setActiveWalletId(id);
    setWalletId(id);
  }

  async function addWallet(name) {
    const wallet = await createWallet(name);
    setWallets((w) => [...w, wallet]);
    switchWallet(wallet.id);
    return wallet;
  }

  async function removeWallet(id) {
    const next = await deleteWallet(id);
    setWallets(next);
    if (walletId === id) switchWallet(next[0]?.id || 'main');
  }

  return (
    <App
      key={walletId}
      walletId={walletId}
      wallets={wallets}
      onSwitchWallet={switchWallet}
      onCreateWallet={addWallet}
      onDeleteWallet={removeWallet}
    />
  );
}
