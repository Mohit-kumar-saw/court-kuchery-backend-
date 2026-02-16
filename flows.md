🚀 COMPLETE SYSTEM FLOW (MVP)


🔐 1️⃣ AUTH FLOW
/////////////////////

##USER REGISTERS
    ↓
Password hashed (bcrypt)
    ↓
User saved in DB
    ↓
Access + Refresh token generated
    ↓
Tokens returned to frontend

/////////////////////

##USER LOGIN
    ↓
Email + password verified
    ↓
JWT issued (contains id + role)
    ↓
Refresh token saved in DB

///////////////////////

##ACCESS TOKEN EXPIRES
    ↓
Frontend calls /auth/refresh
    ↓
Refresh token verified
    ↓
New access token issued

///////////////////////

💰 2️⃣ WALLET FLOW


##USER RECHARGES WALLET
    ↓
POST /wallet/recharge
    ↓
WalletTransaction (CREDIT) created
    ↓
User.walletBalance updated

///////////////////////////////

##USER CHECKS BALANCE
    ↓
GET /wallet/balance
    ↓
Returns current walletBalance

/////////////////////////

⚖️ 3️⃣ LAWYER FLOW


##LAWYER REGISTER
    ↓
Saved with isVerified = false

//////////////////

##ADMIN VERIFY LAWYER
    ↓
PATCH /lawyer/:id/verify
    ↓
isVerified = true

///////////////////////

##LAWYER LOGIN
    ↓
JWT issued (role: LAWYER)

LAWYER SETS AVAILABILITY
    ↓
PATCH /lawyer/availability
    ↓
isOnline updated

/////////////////

📞 4️⃣ CONSULTATION FLOW


##USER SELECTS LAWYER
    ↓
POST /consult/start
    ↓
Checks:
  - Wallet ≥ MIN_BALANCE
  - Lawyer verified
  - Lawyer online
  - No active session
    ↓
Redis locks:
  - lock:user
  - lock:lawyer
    ↓
ConsultSession created (ACTIVE)
    ↓
Auto billing engine starts (10 sec interval)

//////////////////////////////////////////////////////////

##💸 5️⃣ AUTO BILLING FLOW

Every 10 seconds:

##Check wallet balance
    ↓
Deduct per-second amount
    ↓
Update session.totalAmount
    ↓
If balance ≤ deduction
    ↓
Auto cut session
    ↓
Create WalletTransaction (DEBIT)
    ↓
Session status → FORCE_ENDED
    ↓
Release Redis locks

//////////////////////////////////////////////////////////

##🛑 MANUAL END FLOW
##POST /consult/:sessionId/end
    ↓
Stop billing interval
    ↓
Session status → ENDED
    ↓
Release Redis locks
    ↓
Return totalAmount + remainingBalance

//////////////////////////////////////////////////////////

##💬 6️⃣ CHAT FLOW


🔌 Socket Connection

Frontend connects socket
    ↓
Token verified
    ↓
socket.user = { id, role }

//////////////////////////////////////////////////////////

##Join Session

socket.emit("join_session")
    ↓
Check session exists
    ↓
Check user belongs to session
    ↓
Join room

//////////////////////////////////////////////////////////

##Send Message
socket.emit("send_message")
    ↓
Check session ACTIVE
    ↓
Check participant
    ↓
Message saved in DB (status: SENT)
    ↓
Emit to room

//////////////////////////////////////////////////////////

##Delivered Flow

Receiver gets message
    ↓
socket.emit("message_delivered")
    ↓
Update status → DELIVERED
    ↓
Emit status update

//////////////////////////////////////////////////////////

##Seen Flow
User opens chat screen
    ↓
socket.emit("mark_seen")
    ↓
Update all messages to SEEN
    ↓
Emit bulk status update

//////////////////////////////////////////////////////////

📜 7️⃣ CHAT HISTORY FLOW
GET /chat/:sessionId
    ↓
Validate session
    ↓
Validate user belongs
    ↓
Paginated messages returned

//////////////////////////////////////////////////////////

⭐ 8️⃣ REVIEW FLOW
User ends consultation
    ↓
POST /review
    ↓
Review saved
    ↓
Lawyer.rating recalculated

//////////////////////////////////////////////////////////

💼 9️⃣ LAWYER EARNINGS FLOW
Consultation ends
    ↓
LawyerEarning entry created
    ↓
GET /lawyer/earnings/summary
    ↓
Returns:
  - total earnings
  - today earnings
  - total sessions


//////////////////////////////////////////////////////////

🔐 REDIS LOCKING FLOW

When session starts:

acquireLock(lock:user:id)
acquireLock(lock:lawyer:id)


When session ends:

releaseLock(user)
releaseLock(lawyer)


Prevents:

Double booking

Race conditions

Parallel consultations

🧠 CURRENT SYSTEM STATUS

You now have:

✅ JWT Auth
✅ Refresh token flow
✅ Wallet ledger system
✅ Consultation engine
✅ Auto billing
✅ Redis locking
✅ Real-time chat
✅ Message lifecycle (SENT → DELIVERED → SEEN)
✅ Secure chat access
✅ Review system
✅ Lawyer earnings tracking

🎯 ARCHITECTURE LEVEL

This is now:

🔥 A complete MVP backend for a legal consultation platform.

You are not in tutorial-level anymore.
This is real backend system architecture.

🚀 Now Strategic Decision

Next logical step:

1️⃣ Integrate frontend (recommended now)
2️⃣ Add typing indicator
3️⃣ Add online presence tracking
4️⃣ Add WebRTC signaling
5️⃣ Integrate Razorpay real payment