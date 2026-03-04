# 🎯 Job Hunt Confidence Tracker

A P2P anonymous Chrome extension for tracking company hiring behavior. Report your experiences and see aggregated confidence scores for companies based on how they treat job applicants.

## Features

- **Anonymous**: Your identity is a cryptographic keypair, not your name
- **P2P Distributed**: Data syncs across all users via Gun.js
- **Anti-Spam**: Proof-of-work prevents flooding
- **No Duplicates**: Company IDs are deterministic hashes
- **Rate Limited**: 10 reports per day per user
- **Signed Reports**: All submissions are cryptographically signed

## Experience Types & Impact

| Experience | Impact | Description |
|------------|--------|-------------|
| 👻 Long Running Ad, Nobody Hired | -15 | Job posting is up forever, they're not actually hiring |
| 📞 Contacted Then Ghosted | -10 | They reached out, then disappeared |
| 🗣️ Interviewed Then Ghosted | -12 | Went through interview, never heard back |
| ❌ Interviewed, Declined | -3 | Normal rejection (slight negative) |
| 🔄 Excessive Interview Rounds | -8 | Too many interview stages |
| 🚫 Interview No-Show | -20 | They didn't show up to the interview |
| 💬 Good Communication | +5 | Clear, timely communication |
| 🤝 Respectful Process | +10 | Professional and respectful throughout |
| 🎉 Got Hired! | +15 | Successful hire |

## Confidence Scale

- **0-50**: 🔴 Low confidence (many negative reports)
- **51-99**: 🟡 Medium confidence (mixed reports)
- **100-200**: 🟢 High confidence (positive reports)

Companies start at 100 and adjust based on reports.

## Installation

### From Source (Developer Mode)

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `job-confidence-extension` folder
6. The extension icon will appear in your toolbar

### Files Structure

```
job-confidence-extension/
├── manifest.json       # Extension manifest
├── popup.html          # Main UI
├── popup.css           # Styles
├── popup.js            # Main logic
├── crypto.js           # Cryptographic utilities
├── background.js       # Service worker
├── lib/
│   ├── gun.min.js      # Gun.js P2P library
│   └── sea.js          # Gun.js crypto
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## How It Works

### Data Integrity

1. **Deterministic Company IDs**: `id = SHA-256(lowercase(name))` prevents duplicates
2. **Signed Reports**: Every report is signed with your keypair
3. **Proof of Work**: Must solve a hash puzzle to submit (anti-spam)
4. **Peer Validation**: All peers validate incoming reports

### P2P Architecture

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│ Extension A │      │ Extension B │      │ Extension C │
└──────┬──────┘      └──────┬──────┘      └──────┬──────┘
       │                    │                    │
       └────────────────────┼────────────────────┘
                            ▼
                ┌───────────────────────┐
                │  Gun.js Public Relay  │
                └───────────────────────┘
```

### Your Identity

- A keypair is generated on first install
- Stored locally in `chrome.storage.local`
- Your public key is your pseudonymous ID
- Private key signs your reports

## Privacy

- No accounts, no email, no tracking
- Your keypair stays on your device
- Reports are pseudonymous (public key only)
- Data is distributed (no central server)

## Limitations

- Relies on public Gun.js relays (may have downtime)
- Proof-of-work takes 1-5 seconds
- 10 reports per day limit
- One report per company per user

## Future Enhancements

- [ ] Run your own relay for reliability
- [ ] Reputation system for peer weighting
- [ ] Company response feature
- [ ] Export data to CSV
- [ ] Browser notifications for trending companies

## License

MIT License - Use freely, contribute welcome!

## Technical Details

- **P2P Library**: Gun.js with SEA (Security, Encryption, Authorization)
- **Crypto**: Web Crypto API (ECDSA P-256)
- **Proof of Work**: SHA-256 with 3 leading zeros (~1-5 sec on modern hardware)
- **Storage**: chrome.storage.local + Gun.js distributed storage
