"""Sends order confirmation emails via Mailgun.
This is the ONLY job of this backend — everything else (products, cart,
orders, auth) talks to Supabase directly from the React frontend.
Start with:  uvicorn main:app --reload
"""
import os

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

MAILGUN_API_KEY = os.getenv("MAILGUN_API_KEY")
MAILGUN_DOMAIN = os.getenv("MAILGUN_DOMAIN")
MAILGUN_FROM = os.getenv("MAILGUN_FROM", "Baking Shop <orders@example.com>")

app = FastAPI(title="Baking Shop — email service")

# Allowing all origins keeps setup simple for this assignment. For a real
# production app, replace "*" with your exact deployed frontend URL.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class OrderItem(BaseModel):
    name: str
    quantity: int
    unit_price: float


class ConfirmationRequest(BaseModel):
    to_email: str
    customer_name: str
    order_id: str
    items: list[OrderItem]
    total: float


def build_email_body(body: ConfirmationRequest) -> str:
    lines = [f"Hi {body.customer_name},", "", "Thanks for your order! Here's what you ordered:", ""]
    for item in body.items:
        lines.append(f"  - {item.name} x{item.quantity} — ₦{item.unit_price * item.quantity:,.2f}")
    lines += ["", f"Total: ₦{body.total:,.2f}", "", f"Order reference: {body.order_id}", "", "We'll get this ready for you soon!"]
    return "\n".join(lines)


@app.post("/api/send-confirmation")
async def send_confirmation(body: ConfirmationRequest):
    if not MAILGUN_API_KEY or not MAILGUN_DOMAIN:
        raise HTTPException(500, "Mailgun is not configured. Set MAILGUN_API_KEY and MAILGUN_DOMAIN in backend/.env")

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"https://api.mailgun.net/v3/{MAILGUN_DOMAIN}/messages",
            auth=("api", MAILGUN_API_KEY),
            data={
                "from": MAILGUN_FROM,
                "to": [body.to_email],
                "subject": f"Order confirmed — {body.order_id[:8]}",
                "text": build_email_body(body),
            },
        )
    if resp.status_code >= 300:
        raise HTTPException(502, f"Mailgun error: {resp.text}")
    return {"sent": True}
