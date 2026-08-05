import {
  Card,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { ReactNode } from 'react';
import { View } from 'react-native';

export default function DataView({ data, actions, className, ...props }: React.ComponentProps<typeof View> & React.RefAttributes<View> & { data: object, actions?: ReactNode }) {

  return (
    <Card {...props} className={cn('w-full', className)}>
      <CardContent>
        {Object.entries(data).map(([k, v]) => (
          <Text key={k}>{`${k} : ${v}`}</Text>
        ))}
      </CardContent>
      <CardFooter>
        {actions}
      </CardFooter>
    </Card>
  );
}
