import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/Badge";
import { ErrorState } from "@/components/ErrorState";
import { GlassCard } from "@/components/GlassCard";
import { Spinner } from "@/components/Spinner";
import { useAsync } from "@/hooks/useAsync";
import { formatDate, vnd, paymentStatusLabel } from "@/lib/utils";
import { adminApi } from "@/services/admin.api";

type CustomerInfo = {
  id?: string;
  name?: string | null;
  full_name?: string | null;
  fullName?: string | null;
  phone?: string | null;
  phone_number?: string | null;
  phoneNumber?: string | null;
};

type MaterialOrderRow = {
  id: string;
  orderCode?: string | null;
  customerId?: string | null;
  customer?: CustomerInfo | null;
  storeId?: string | null;
  storeName?: string | null;
  items?: Array<{
    id?: string;
    materialId?: string;
    name?: string;
    quantity?: number;
    lineTotal?: number;
  }> | null;
  totalAmount?: number | string | null;
  status: string;
  paymentStatus: string;
  createdAt?: string | Date | null;
};

export function AdminMaterialOrdersPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [page, setPage] = useState(1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { data, loading, error, reload } = useAsync(
    async () =>
      adminApi.listMaterialOrders({
        q: search.trim(),
        status: status || undefined,
        paymentStatus: paymentStatus || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        page,
        limit: 10,
      }),
    [search, status, paymentStatus, page, startDate, endDate],
  );

  const orders = (data?.items ?? []) as MaterialOrderRow[];

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleStatusChange = (value: string) => {
    setStatus(value);
    setPage(1);
  };

  const handlePaymentStatusChange = (value: string) => {
    setPaymentStatus(value);
    setPage(1);
  };



  const materialStatusLabel = (value: string) => {
    const labels: Record<string, string> = {
      PENDING_PAYMENT: "Chờ thanh toán",
      PENDING_CONFIRMATION: "Chờ xác nhận",
      DEPOSIT_PAID: "Đã cọc",
      CONFIRMED: "Đã xác nhận",
      PREPARING: "Đang chuẩn bị",
      READY_FOR_DELIVERY: "Sẵn sàng giao",
      DELIVERING: "Đang giao",
      DELIVERED: "Đã giao",
      CUSTOMER_RECEIVED: "Khách đã nhận",
      COMPLETED: "Hoàn thành",
      CANCELLED: "Đã hủy",
    };

    return labels[value] || value || "Không xác định";
  };

  const getStatusTone = (
    value: string,
  ): "success" | "danger" | "info" | "warn" => {
    if (value === "COMPLETED" || value === "CUSTOMER_RECEIVED") {
      return "success";
    }

    if (value === "CANCELLED") {
      return "danger";
    }

    if (["DELIVERING", "DELIVERED"].includes(value)) {
      return "info";
    }

    return "warn";
  };

  const inputClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

  const selectClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

  const quickStatuses = [
    { label: "Tất cả", value: "" },
    { label: "Đang giao", value: "DELIVERING" },
    { label: "Hoàn thành", value: "COMPLETED,CUSTOMER_RECEIVED" },
    { label: "Đã hủy", value: "CANCELLED" },
  ];

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 text-slate-800">
      <GlassCard>
        <div className="space-y-8 p-5 md:p-8">
          {/* Tiêu đề */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="mb-2 text-2xl font-bold text-slate-900">
                Quản lý đơn vật liệu
              </h1>
              <p className="text-sm text-slate-500">
                Giám sát và tra cứu các giao dịch vật liệu COD trên toàn hệ
                thống
              </p>
            </div>

            <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              Admin
            </span>
          </div>

          {/* Thống kê */}
          {/* Thống kê */}
          <div className="grid grid-cols-2 gap-5 border-b border-slate-200 pb-8 sm:grid-cols-3 lg:grid-cols-5">
            <div>
              <p className="mb-2 text-sm text-slate-500">Tổng đơn</p>
              <p className="text-2xl font-bold text-black">
                {data?.stats?.orderCount ?? 0}
              </p>
            </div>

            <div>
              <p className="mb-2 text-sm text-slate-500">Chờ xác nhận</p>
              <p className="text-2xl font-bold text-black">
                {data?.stats?.processingCount ?? 0}
              </p>
            </div>

            <div>
              <p className="mb-2 text-sm text-slate-500">Đang giao</p>
              <p className="text-2xl font-bold text-black">
                {data?.stats?.deliveringCount ?? 0}
              </p>
            </div>

            <div>
              <p className="mb-2 text-sm text-slate-500">Hoàn thành</p>
              <p className="text-2xl font-bold text-black">
                {data?.stats?.completedCount ?? 0}
              </p>
            </div>

            <div>
              <p className="mb-2 text-sm text-slate-500">Đã hủy</p>
              <p className="text-2xl font-bold text-black">
                {data?.stats?.cancelledCount ?? 0}
              </p>
            </div>
          </div>

          {/* Tìm kiếm và bộ lọc */}
          <section className="space-y-5">
            <h2 className="text-base font-semibold text-slate-900">
              Tìm kiếm và lọc đơn hàng
            </h2>

            <div className="relative">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>

              <input
                type="text"
                value={search}
                placeholder="Tìm theo mã đơn, khách hàng, cửa hàng, số điện thoại..."
                onChange={(event) => handleSearchChange(event.target.value)}
                className={`${inputClass} pl-10`}
              />
            </div>

            {/* Lọc nhanh */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">
                Trạng thái nhanh
              </label>

              <div className="flex flex-wrap gap-2">
                {quickStatuses.map((item) => {
                  const active = status === item.value;

                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => handleStatusChange(item.value)}
                      className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                        active
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-slate-300 bg-white text-slate-700 hover:border-blue-400 hover:bg-blue-50"
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Trạng thái thanh toán và đơn hàng */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label
                  htmlFor="paymentStatus"
                  className="block text-sm font-medium text-slate-700"
                >
                  Trạng thái thanh toán
                </label>

                <select
                  id="paymentStatus"
                  value={paymentStatus}
                  onChange={(event) =>
                    handlePaymentStatusChange(event.target.value)
                  }
                  className={selectClass}
                >
                  <option value="">Tất cả thanh toán</option>
                  <option value="PAID">Đã thanh toán</option>
                  <option value="UNPAID">Chưa thanh toán</option>
                </select>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="orderStatus"
                  className="block text-sm font-medium text-slate-700"
                >
                  Trạng thái đơn hàng
                </label>

                <select
                  id="orderStatus"
                  value={status}
                  onChange={(event) => handleStatusChange(event.target.value)}
                  className={selectClass}
                >
                  <option value="">Tất cả trạng thái</option>
                  <option value="PENDING_PAYMENT">Chờ thanh toán</option>
                  <option value="PENDING_CONFIRMATION">Chờ xác nhận</option>
                  <option value="DEPOSIT_PAID">Đã cọc</option>
                  <option value="CONFIRMED">Đã xác nhận</option>
                  <option value="PREPARING">Đang chuẩn bị</option>
                  <option value="READY_FOR_DELIVERY">Sẵn sàng giao</option>
                  <option value="DELIVERING">Đang giao</option>
                  <option value="DELIVERED">Đã giao</option>
                  <option value="CUSTOMER_RECEIVED">Khách đã nhận</option>
                  <option value="COMPLETED">Hoàn thành</option>
                  <option value="CANCELLED">Đã hủy</option>
                </select>
              </div>
            </div>
          </section>

          {/* Danh sách đơn hàng */}
         {loading ? (
  <div className="flex h-64 items-center justify-center">
    <Spinner />
  </div>
) : error ? (
  <ErrorState body={error} onRetry={reload} />
) : orders.length === 0 ? (
  <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-black">
    <p>Không tìm thấy đơn hàng nào</p>
  </div>
) : (
  <div className="overflow-x-auto">
    <table className="w-full text-sm text-black">
      <thead>
        <tr className="border-b border-slate-200 bg-slate-50 text-black">
          <th className="whitespace-nowrap px-3 py-4 font-semibold text-black">
            Mã đơn
          </th>
          <th className="whitespace-nowrap px-3 py-4 font-semibold text-black">
            Khách hàng
          </th>
          <th className="whitespace-nowrap px-3 py-4 font-semibold text-black">
            Cửa hàng
          </th>
          <th className="whitespace-nowrap px-3 py-4 text-center font-semibold text-black">
            SL
          </th>
          <th className="whitespace-nowrap px-3 py-4 text-right font-semibold text-black">
            Tổng tiền
          </th>
          <th className="whitespace-nowrap px-3 py-4 font-semibold text-black">
            Trạng thái
          </th>
          <th className="whitespace-nowrap px-3 py-4 font-semibold text-black">
            Thanh toán
          </th>
          <th className="whitespace-nowrap px-3 py-4 text-right font-semibold text-black">
            Ngày đặt
          </th>
          <th className="px-3 py-4" />
        </tr>
      </thead>

                <tbody className="divide-y divide-slate-100">
                  {orders.map((order) => {
                    const customerName =
                      order.customer?.full_name?.trim() ||
                      order.customer?.fullName?.trim() ||
                      order.customer?.name?.trim() ||
                      "";

                    const customerPhone =
                      order.customer?.phone_number ||
                      order.customer?.phoneNumber ||
                      order.customer?.phone ||
                      "";

                    return (
                      <tr
                        key={order.id}
                        className="text-slate-700 transition-colors text-black"
                      >
                        <td className="whitespace-nowrap px-3 py-4 font-semibold text-black">
                          {order.orderCode || "—"}
                        </td>

                        <td className="px-3 py-4">
                          <div className="flex min-w-[160px] flex-col">
                            <span className="font-medium text-slate-800">
                              {customerName || "Chưa có tên khách hàng"}
                            </span>

                            <span className="text-xs text-slate-500">
                              {customerPhone || order.customerId || "—"}
                            </span>
                          </div>
                        </td>

                        <td className="px-3 py-4">
                          <div className="flex min-w-[140px] flex-col">
                            <span className="font-medium text-slate-800">
                              {order.storeName || "—"}
                            </span>
                            <span className="text-xs text-slate-500">
                              {order.storeId || ""}
                            </span>
                          </div>
                        </td>

                        <td className="px-3 py-4 text-center">
                          {order.items?.length ?? 0}
                        </td>

                        <td className="whitespace-nowrap px-3 py-4 text-right font-semibold text-black">
                          {vnd(Number(order.totalAmount || 0))}
                        </td>

                        <td className="whitespace-nowrap px-3 py-4">
                          <Badge tone={getStatusTone(order.status)}>
                            {materialStatusLabel(order.status)}
                          </Badge>
                        </td>

                        <td className="whitespace-nowrap px-3 py-4">
                          <Badge
                            tone={
                              order.paymentStatus === "PAID"
                                ? "success"
                                : "warn"
                            }
                          >
                            {paymentStatusLabel(order.paymentStatus)}
                          </Badge>
                        </td>

                        <td className="whitespace-nowrap px-3 py-4 text-right text-xs text-slate-500">
                          {order.createdAt
                            ? formatDate(
                                order.createdAt instanceof Date
                                  ? order.createdAt.toISOString()
                                  : order.createdAt,
                              )
                            : "—"}
                        </td>

                        <td className="whitespace-nowrap px-3 py-4 text-right">
                          <Link
                            to={`/material-orders/${order.id}`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900 hover:underline"
                          >
                            Chi tiết
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M5 12h14" />
                              <path d="m12 5 7 7-7 7" />
                            </svg>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Phân trang */}
              {data?.pagination && data.pagination.pages > 1 && (
                <div className="mt-4 flex items-center justify-between gap-4 border-t border-slate-200 pt-5">
                  <p className="text-xs text-slate-500">
                    Trang {data.pagination.page} / {data.pagination.pages} (
                    {data.pagination.total} đơn hàng)
                  </p>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() =>
                        setPage((current) => Math.max(1, current - 1))
                      }
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Trước
                    </button>

                    <button
                      type="button"
                      disabled={page >= data.pagination.pages}
                      onClick={() =>
                        setPage((current) =>
                          Math.min(data.pagination.pages, current + 1),
                        )
                      }
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Sau
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <p className="border-t border-slate-100 pt-4 text-center text-xs text-slate-400">
            BuildMate Admin System
          </p>
        </div>
      </GlassCard>
    </div>
  );
}
