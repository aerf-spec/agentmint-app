type SignedStampProps = {
  date: string;
};

export function SignedStamp({ date }: SignedStampProps) {
  return <span className="signed-stamp">Signed {date}</span>;
}
