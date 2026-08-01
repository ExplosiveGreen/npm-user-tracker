import { Text } from '@/components/ui/text';
import { Link } from 'expo-router';

export default function Index() {

  return (
    <Link href="/db">
      Go to DB screen
    </Link>
  );
}
