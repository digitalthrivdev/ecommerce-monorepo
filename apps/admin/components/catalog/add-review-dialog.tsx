"use client";

import { useState } from "react";
import { Loader2, MessageSquarePlus } from "lucide-react";

import { addReview } from "@/app/(dashboard)/reviews/actions";
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
import { Textarea } from "@/components/ui/textarea";
import { useFormAction } from "@/hooks/use-form-action";

const RATINGS = [
  ["5", "★★★★★  Excellent"],
  ["4", "★★★★  Good"],
  ["3", "★★★  Okay"],
  ["2", "★★  Poor"],
  ["1", "★  Very poor"],
] as const;

export function AddReviewDialog({ productId, productName }: { productId: string; productName: string }) {
  const [open, setOpen] = useState(false);
  const { pending, fieldErrors, onSubmit, reset } = useFormAction(addReview, () => setOpen(false));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <MessageSquarePlus />
          Add review
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Add a review</DialogTitle>
            <DialogDescription>
              Shown on {productName} in the app under the name you enter, and counted in its rating. Only reviews from customers&apos; orders are marked as verified purchases.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="productId" value={productId} />
          <FieldGroup>
            <Field data-invalid={Boolean(fieldErrors.authorName)}>
              <FieldLabel htmlFor="review-author">Reviewer name</FieldLabel>
              <Input id="review-author" name="authorName" maxLength={40} required placeholder="Asha R." aria-invalid={Boolean(fieldErrors.authorName)} />
              <FieldError>{fieldErrors.authorName}</FieldError>
            </Field>
            <Field data-invalid={Boolean(fieldErrors.rating)}>
              <FieldLabel htmlFor="review-rating">Rating</FieldLabel>
              <Select name="rating" defaultValue="5">
                <SelectTrigger id="review-rating" className="w-full" aria-invalid={Boolean(fieldErrors.rating)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RATINGS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError>{fieldErrors.rating}</FieldError>
            </Field>
            <Field data-invalid={Boolean(fieldErrors.comment)}>
              <FieldLabel htmlFor="review-comment">Review</FieldLabel>
              <Textarea id="review-comment" name="comment" maxLength={500} rows={4} placeholder="Fresh, crunchy and well packed." aria-invalid={Boolean(fieldErrors.comment)} />
              <FieldDescription>Optional. Reviews without text only count toward the rating.</FieldDescription>
              <FieldError>{fieldErrors.comment}</FieldError>
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
              Add review
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
