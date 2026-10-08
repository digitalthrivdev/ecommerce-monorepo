"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";

import { saveCoupon } from "@/app/(dashboard)/coupons/actions";
import { MoneyInput } from "@/components/money-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useFormAction } from "@/hooks/use-form-action";
import type { Coupon, CouponDiscountType } from "@/lib/types";

export function CouponDialog({ coupon, currency }: { coupon?: Coupon; currency: string }) {
  const [open, setOpen] = useState(false);
  const [discountType, setDiscountType] = useState<CouponDiscountType>(coupon?.discountType ?? "FLAT");
  const { pending, fieldErrors, onSubmit, reset } = useFormAction(saveCoupon, () => setOpen(false));
  const invalid = (name: string) => Boolean(fieldErrors[name]);
  const locked = coupon?.termsLocked ?? false;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          reset();
          setDiscountType(coupon?.discountType ?? "FLAT");
        }
      }}
    >
      <DialogTrigger asChild>
        {coupon ? (
          <Button variant="outline" size="sm">
            Edit
          </Button>
        ) : (
          <Button>
            <Plus />
            New coupon
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{coupon ? `Edit ${coupon.code}` : "New coupon"}</DialogTitle>
            <DialogDescription>
              {locked
                ? "Orders have used this coupon, so its code and discount can't change. Switch it off and create a new one to change them."
                : "Customers enter the code at checkout. One coupon per order."}
            </DialogDescription>
          </DialogHeader>
          {coupon && <input type="hidden" name="id" value={coupon.id} />}
          <input type="hidden" name="discountType" value={discountType} />
          <FieldGroup>
            <Field data-invalid={invalid("code")}>
              <FieldLabel htmlFor="coupon-code">Code</FieldLabel>
              <Input
                id="coupon-code"
                name="code"
                defaultValue={coupon?.code}
                maxLength={20}
                required
                readOnly={locked}
                placeholder="WELCOME50"
                className="uppercase"
                autoComplete="off"
                aria-invalid={invalid("code")}
              />
              <FieldDescription>3 to 20 letters and numbers. Customers can type it in any case.</FieldDescription>
              <FieldError>{fieldErrors.code}</FieldError>
            </Field>
            <Field data-invalid={invalid("description")}>
              <FieldLabel htmlFor="coupon-description">Description</FieldLabel>
              <Input
                id="coupon-description"
                name="description"
                defaultValue={coupon?.description ?? ""}
                maxLength={200}
                placeholder="Optional, e.g. ₹50 off your first order"
                aria-invalid={invalid("description")}
              />
              <FieldDescription>Shown to the customer when the coupon is applied.</FieldDescription>
              <FieldError>{fieldErrors.description}</FieldError>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="coupon-type">Discount</FieldLabel>
                <Select value={discountType} onValueChange={(value) => setDiscountType(value as CouponDiscountType)} disabled={locked}>
                  <SelectTrigger id="coupon-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FLAT">Flat amount</SelectItem>
                    <SelectItem value="PERCENT">Percentage</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field data-invalid={invalid("discountValue")}>
                <FieldLabel htmlFor="coupon-value">{discountType === "PERCENT" ? "Percent off" : "Amount off"}</FieldLabel>
                {discountType === "PERCENT" ? (
                  <Input
                    key="percent"
                    id="coupon-value"
                    name="discountValue"
                    inputMode="decimal"
                    defaultValue={coupon?.discountType === "PERCENT" ? coupon.discountValue : ""}
                    maxLength={6}
                    required
                    readOnly={locked}
                    placeholder="10"
                    autoComplete="off"
                    aria-invalid={invalid("discountValue")}
                  />
                ) : (
                  <MoneyInput
                    key="flat"
                    id="coupon-value"
                    name="discountValue"
                    currency={currency}
                    defaultValue={coupon?.discountType === "FLAT" ? coupon.discountValue : ""}
                    required
                    readOnly={locked}
                    aria-invalid={invalid("discountValue")}
                  />
                )}
                <FieldError>{fieldErrors.discountValue}</FieldError>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {discountType === "PERCENT" && (
                <Field data-invalid={invalid("maxDiscount")}>
                  <FieldLabel htmlFor="coupon-max">Maximum discount</FieldLabel>
                  <MoneyInput
                    id="coupon-max"
                    name="maxDiscount"
                    currency={currency}
                    defaultValue={coupon?.maxDiscount ?? ""}
                    readOnly={locked}
                    placeholder="No maximum"
                    aria-invalid={invalid("maxDiscount")}
                  />
                  <FieldError>{fieldErrors.maxDiscount}</FieldError>
                </Field>
              )}
              <Field data-invalid={invalid("minOrderValue")}>
                <FieldLabel htmlFor="coupon-min">Minimum order</FieldLabel>
                <MoneyInput
                  id="coupon-min"
                  name="minOrderValue"
                  currency={currency}
                  defaultValue={coupon && Number(coupon.minOrderValue) > 0 ? coupon.minOrderValue : ""}
                  placeholder="No minimum"
                  aria-invalid={invalid("minOrderValue")}
                />
                <FieldDescription>Items total, before delivery.</FieldDescription>
                <FieldError>{fieldErrors.minOrderValue}</FieldError>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={invalid("startsOn")}>
                <FieldLabel htmlFor="coupon-starts">First day</FieldLabel>
                <Input id="coupon-starts" name="startsOn" type="date" defaultValue={coupon?.startsOn ?? ""} aria-invalid={invalid("startsOn")} />
                <FieldDescription>Empty: from today.</FieldDescription>
                <FieldError>{fieldErrors.startsOn}</FieldError>
              </Field>
              <Field data-invalid={invalid("endsOn")}>
                <FieldLabel htmlFor="coupon-ends">Last day</FieldLabel>
                <Input id="coupon-ends" name="endsOn" type="date" defaultValue={coupon?.endsOn ?? ""} aria-invalid={invalid("endsOn")} />
                <FieldDescription>Empty: no end date.</FieldDescription>
                <FieldError>{fieldErrors.endsOn}</FieldError>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={invalid("totalLimit")}>
                <FieldLabel htmlFor="coupon-total-limit">Total uses</FieldLabel>
                <Input
                  id="coupon-total-limit"
                  name="totalLimit"
                  inputMode="numeric"
                  defaultValue={coupon?.totalLimit ?? ""}
                  maxLength={7}
                  placeholder="Unlimited"
                  autoComplete="off"
                  aria-invalid={invalid("totalLimit")}
                />
                <FieldError>{fieldErrors.totalLimit}</FieldError>
              </Field>
              <Field data-invalid={invalid("perCustomerLimit")}>
                <FieldLabel htmlFor="coupon-customer-limit">Uses per customer</FieldLabel>
                <Input
                  id="coupon-customer-limit"
                  name="perCustomerLimit"
                  inputMode="numeric"
                  defaultValue={coupon?.perCustomerLimit ?? ""}
                  maxLength={7}
                  placeholder="Unlimited"
                  autoComplete="off"
                  aria-invalid={invalid("perCustomerLimit")}
                />
                <FieldError>{fieldErrors.perCustomerLimit}</FieldError>
              </Field>
            </div>
            <FieldDescription>Cancelled orders don&apos;t count as uses.</FieldDescription>
            <Field orientation="horizontal">
              <Switch id="coupon-first-order" name="firstOrderOnly" defaultChecked={coupon?.firstOrderOnly ?? false} />
              <FieldLabel htmlFor="coupon-first-order">First order only</FieldLabel>
            </Field>
            <Field orientation="horizontal">
              <Switch id="coupon-active" name="isActive" defaultChecked={coupon?.isActive ?? true} />
              <FieldLabel htmlFor="coupon-active">Active</FieldLabel>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {coupon ? "Save" : "Create coupon"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
