import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransmitToWatchButton } from './TransmitToWatchButton';
import { routeService } from '../api/routeService';
import { useRouteStore } from '../../../app/store/routeStore';

vi.mock('../api/routeService', () => ({
  routeService: {
    dispatchToSmartwatch: vi.fn(),
    getRouteById: vi.fn(),
    getActiveRoutes: vi.fn(),
  },
}));

describe('TransmitToWatchButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRouteStore.setState({ activeRoutes: {} });
  });

  it('se renderiza correctamente con el estado inicial', () => {
    render(
      <TransmitToWatchButton
        routeId={10}
        driverId={42}
        driverName="Juan Pérez"
      />
    );

    expect(screen.getByRole('button')).toHaveTextContent(/Transmitir a Smartwatch/i);
  });

  it('ejecuta POST /api/routes/{routeId}/dispatch al hacer clic y muestra éxito', async () => {
    const mockDispatch = vi.mocked(routeService.dispatchToSmartwatch).mockResolvedValueOnce({
      routeId: 10,
      driverId: 42,
      status: 'PLANNED',
      message: 'Dispatched',
    });

    const onSuccess = vi.fn();

    render(
      <TransmitToWatchButton
        routeId={10}
        driverId={42}
        driverName="Juan Pérez"
        onSuccess={onSuccess}
      />
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    // Debe invocar el servicio de ruta con routeId y driverId
    expect(mockDispatch).toHaveBeenCalledWith(10, 42);

    // Esperar a que el toast aparezca y se invoque onSuccess
    await waitFor(() => {
      expect(screen.getByText(/Ruta transmitida al reloj del conductor \(Juan Pérez\)/i)).toBeInTheDocument();
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });

  it('muestra estado deshabilitado si falta el driverId', () => {
    render(
      <TransmitToWatchButton
        routeId={10}
        driverId={0}
      />
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(screen.getByText(/Debe asignar un conductor antes de transmitir al reloj/i)).toBeInTheDocument();
  });
});

