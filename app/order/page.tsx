import type { Metadata } from "next";
import { CustomerOrderPage } from "@/components/order/customer-order-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Đặt Món Online • La Boong - Trà Ô Long Làng La Boong",
  description:
    "Đặt món trực tuyến tại La Boong. Trà ô long hảo hạng, dòng Săn Mây bồng bềnh, cà phê và thức uống thanh mát. Giao hàng nhanh, phục vụ chu đáo.",
};

export default function OrderPage() {
  return <CustomerOrderPage />;
}
