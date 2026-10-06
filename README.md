# Suivi actions CA

Application mobile de suivi des réunions de bureau, des conseils d'administration et des actions décidées.

## Fonctionnalités

- Réunions de **bureau** et de **conseil d'administration**, avec comptes rendus joints (PDF, Word…) et synthèse.
- **Actions** avec responsable, échéance, périmètre, statut et historique d'avancement.
- **Codes couleur** : en retard (rouge), échéance sous 7 jours (orange), bloquée (violet), en cours (bleu), à faire (gris), terminée (vert).
- Vue **par responsable** pour le tour de table du CA.
- Chaque responsable met à jour le statut et l'avancement de ses propres actions.
- Accès personnalisés : **Administrateur**, **Bureau**, **Conseil d'administration** (Bureau et CA cumulables).
- Mot de passe provisoire à changer à la première connexion, lien « mot de passe oublié ».
- Installable sur l'écran d'accueil du téléphone.

## Architecture

| Élément | Détail |
|---|---|
| Base de données et authentification | Supabase, projet `suivi-actions-ca` (région Paris, `eu-west-3`) |
| Règles d'accès | RLS Postgres, voir `supabase/migrations/001_schema.sql` |
| Comptes rendus | Supabase Storage, bucket privé `comptes-rendus` (liens signés de 5 min) |
| Gestion des membres | Edge Function `admin-users` (réservée aux administrateurs) |
| Interface | React + Vite, site statique dans `dist/` |

## Déploiement de l'interface

L'interface est un site statique : n'importe quel hébergeur convient.

**GitHub Pages** : pousser ce dépôt sur GitHub, puis Settings → Pages → Source : « GitHub Actions ». Le workflow `.github/workflows/deploy.yml` publie à chaque push sur `main`.

**Netlify ou Vercel** : importer le dépôt, commande `npm run build`, dossier `dist`.

## Configuration Supabase à faire une fois l'URL connue

Dans le tableau de bord Supabase, Authentication → URL Configuration :

1. **Site URL** : l'adresse de l'application (ex. `https://xxx.github.io/suivi-actions-ca/`).
2. **Redirect URLs** : ajouter la même adresse.

Sans cela, le lien « mot de passe oublié » renvoie vers une adresse par défaut.

Recommandé :

- Authentication → Emails → SMTP : brancher la messagerie de l'établissement. Le service d'envoi intégré de Supabase est limité à quelques emails par heure.
- Authentication → Providers → Email : désactiver « Allow new users to sign up » (les comptes sont créés uniquement par un administrateur).
- Authentication → Password security : activer la protection contre les mots de passe compromis.

## Développement local

```bash
npm install
npm run dev
```

Les variables sont dans `.env` (URL du projet et clé publishable, publiques par conception).

## Fichiers

- `supabase/migrations/001_schema.sql` : schéma appliqué.
- `supabase/optional/002_hardening.sql` : durcissement complémentaire (fonctions internes hors API, index), non encore appliqué.
- `supabase/functions/admin-users/index.ts` : création, modification, réinitialisation et suppression des membres.
