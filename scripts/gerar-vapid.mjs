// Gera um par de chaves VAPID para Web Push. Mostra no terminal; NUNCA grava em arquivo nem faz commit.
// Cadastre VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT no painel da Hostinger.
import webpush from "web-push";

const k = webpush.generateVAPIDKeys();
console.log("Copie para as variáveis de ambiente do servidor (não versionar):\n");
console.log(`VAPID_PUBLIC_KEY=${k.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${k.privateKey}`);
console.log("VAPID_SUBJECT=mailto:contato@seu-dominio.exemplo   # troque por um e-mail real da comunidade");
console.log("\nCRON_SECRET: gere com  npm run gerar:segredo");
