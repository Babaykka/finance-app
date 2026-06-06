import Link from "next/link";

type SortOption<T extends string> = {
  value: T;
  label: string;
};

export function SortControls<T extends string>({
  basePath,
  current,
  defaultValue,
  label,
  options
}: {
  basePath: string;
  current: T;
  defaultValue: T;
  label: string;
  options: Array<SortOption<T>>;
}) {
  return (
    <div className="sort-strip" aria-label={label}>
      {options.map((option) => {
        const isActive = option.value === current;
        const href =
          option.value === defaultValue
            ? { pathname: basePath }
            : { pathname: basePath, query: { sort: option.value } };

        return (
          <Link
            aria-current={isActive ? "true" : undefined}
            className={isActive ? "sort-link sort-link-active" : "sort-link"}
            href={href}
            key={option.value}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}
